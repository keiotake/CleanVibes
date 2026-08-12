function doGet(e) {
  try {
    // 動画機能が使えるGASかどうかの確認（フロントはこれが返るまで動画UIを出さない）
    if (e.parameter.video_support) {
      var vcb = e.parameter.callback || 'cb';
      return ContentService.createTextOutput(vcb + '({"videoSupport":true})')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    // 写真アップロード結果の確認
    if (e.parameter.check_upload) {
      return handleCheckUpload(e);
    }

    // 写真をbase64で返す（行政報告書のWord埋め込み用）
    if (e.parameter.photo_b64) {
      return handlePhotoBase64(e);
    }

    // 通常のデータ取得
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Clean Vibes');
    var data = sheet.getRange('A1').getValue();
    var json = data || '{"records":[],"members":[]}';
    var callback = e.parameter.callback;
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + json + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    var fallback = '{"records":[],"members":[]}';
    if (e.parameter && e.parameter.callback) {
      return ContentService.createTextOutput(e.parameter.callback + '(' + fallback + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(fallback)
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleCheckUpload(e) {
  var uploadId = e.parameter.check_upload;
  var callback = e.parameter.callback;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var uploadsSheet = ss.getSheetByName('Uploads');
  var result;

  if (uploadsSheet) {
    var lastRow = uploadsSheet.getLastRow();
    if (lastRow > 0) {
      var data = uploadsSheet.getRange(1, 1, lastRow, 3).getValues();
      for (var i = data.length - 1; i >= 0; i--) {
        if (String(data[i][0]) === String(uploadId)) {
          result = JSON.stringify({status: 'done', url: String(data[i][1])});
          break;
        }
      }
    }
  }

  if (!result) {
    result = JSON.stringify({status: 'pending'});
  }

  if (callback) {
    return ContentService.createTextOutput(callback + '(' + result + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(result)
    .setMimeType(ContentService.MimeType.JSON);
}

// 報告書用: Drive写真をbase64で返す（JSONP）
function handlePhotoBase64(e) {
  var callback = e.parameter.callback;
  var out;
  try {
    var url = e.parameter.photo_b64;
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (resp.getResponseCode() === 200) {
      out = JSON.stringify({ b64: Utilities.base64Encode(resp.getContent()) });
    } else {
      out = JSON.stringify({ b64: null });
    }
  } catch (err) {
    out = JSON.stringify({ b64: null });
  }
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + out + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var action = e.parameter.action;

    if (action === 'upload_image') {
      return handleImageUpload(e);
    }

    // 動画: 分割チャンクの受信／結合してYouTubeへ限定公開投稿
    if (action === 'video_chunk') {
      return handleVideoChunk(e);
    }
    if (action === 'video_finalize') {
      return handleVideoFinalize(e);
    }

    // 行政報告メールのGmail下書きを作成
    if (action === 'report_draft') {
      return handleReportDraft(e);
    }

    // 通常のデータ保存
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Clean Vibes');
    var body = e.parameter.data || e.postData.contents;
    sheet.getRange('A1').setValue(body);
    return ContentService.createTextOutput('ok')
      .setMimeType(ContentService.MimeType.TEXT);
  } catch(err) {
    return ContentService.createTextOutput('error')
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

function handleImageUpload(e) {
  var imageData = e.parameter.image;
  var uploadId = e.parameter.uploadId;

  // CleanVibes_Photos フォルダを取得または作成
  var folderName = 'CleanVibes_Photos';
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

  // Base64デコードしてファイル作成
  var base64 = imageData.replace(/^data:image\/[^;]+;base64,/, '');
  var decoded = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(decoded, 'image/jpeg', 'cv_' + uploadId + '.jpg');
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var fileId = file.getId();
  var url = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800';

  // Uploadsシートに結果を記録
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var uploadsSheet = ss.getSheetByName('Uploads');
  if (!uploadsSheet) {
    uploadsSheet = ss.insertSheet('Uploads');
  }
  uploadsSheet.appendRow([uploadId, url, fileId]);

  return ContentService.createTextOutput('ok')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ==========================================
// 動画: 分割受信 → 結合 → YouTubeへ限定公開投稿
// 事前準備: GASエディタの「サービス +」で YouTube Data API v3 を追加しておくこと
// ==========================================
function getOrCreateFolder_(name) {
  var fs = DriveApp.getFoldersByName(name);
  return fs.hasNext() ? fs.next() : DriveApp.createFolder(name);
}

// チャンク受信: 一時フォルダに uploadId_番号 の名前で保存（再送時は同名を捨てて上書き）
function handleVideoChunk(e) {
  var folder = getOrCreateFolder_('CleanVibes_TmpChunks');
  var name = e.parameter.uploadId + '_' + e.parameter.idx;
  var old = folder.getFilesByName(name);
  while (old.hasNext()) old.next().setTrashed(true);
  var bytes = Utilities.base64Decode(e.parameter.data);
  folder.createFile(Utilities.newBlob(bytes, 'application/octet-stream', name));
  return ContentService.createTextOutput('ok')
    .setMimeType(ContentService.MimeType.TEXT);
}

// 結合してYouTubeへ投稿し、結果をUploadsシートへ書く（フロントはcheck_uploadで受け取る）
function handleVideoFinalize(e) {
  var uploadId = e.parameter.uploadId;
  var total = parseInt(e.parameter.total, 10);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var uploadsSheet = ss.getSheetByName('Uploads') || ss.insertSheet('Uploads');
  // 同じuploadIdが処理済みなら二重投稿しない（再送時の安全弁）
  var lastRow = uploadsSheet.getLastRow();
  if (lastRow > 0) {
    var done = uploadsSheet.getRange(1, 1, lastRow, 1).getValues();
    for (var di = 0; di < done.length; di++) {
      if (String(done[di][0]) === String(uploadId)) {
        return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
      }
    }
  }
  try {
    var folder = getOrCreateFolder_('CleanVibes_TmpChunks');
    var all = [];
    for (var i = 0; i < total; i++) {
      var files = folder.getFilesByName(uploadId + '_' + i);
      if (!files.hasNext()) throw new Error('チャンク' + i + 'が未着です');
      all = all.concat(files.next().getBlob().getBytes());
    }
    var blob = Utilities.newBlob(all, e.parameter.mime || 'video/mp4', 'cleanvibes_' + uploadId + '.mp4');
    var video = YouTube.Videos.insert({
      snippet: { title: e.parameter.title || 'CleanVibes活動動画', description: e.parameter.desc || '' },
      status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false }
    }, 'snippet,status', blob);
    uploadsSheet.appendRow([uploadId, 'https://youtu.be/' + video.id, video.id]);
    for (var k = 0; k < total; k++) {
      var fs2 = folder.getFilesByName(uploadId + '_' + k);
      while (fs2.hasNext()) fs2.next().setTrashed(true);
    }
    return ContentService.createTextOutput('ok')
      .setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    uploadsSheet.appendRow([uploadId, 'ERROR: ' + err.message, '']);
    return ContentService.createTextOutput('error')
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

// ==========================================
// 行政報告メール: Gmail下書きを作成（Before/After写真を添付）
// ==========================================
function handleReportDraft(e) {
  try {
    var to = e.parameter.to || '';
    var cc = e.parameter.cc || '';
    var subject = e.parameter.subject || 'CleanVibes 活動報告';
    var body = e.parameter.body || '';
    var photos = [];
    try { photos = JSON.parse(e.parameter.photos || '[]'); } catch (pe) { photos = []; }

    var attachments = [];
    for (var i = 0; i < photos.length; i++) {
      try {
        var resp = UrlFetchApp.fetch(photos[i].url, { muteHttpExceptions: true, followRedirects: true });
        if (resp.getResponseCode() === 200) {
          attachments.push(resp.getBlob().setName(photos[i].name || ('photo_' + (i + 1) + '.jpg')));
        }
      } catch (ie) { /* skip this photo */ }
    }

    var opts = { attachments: attachments, name: 'CleanVibes 大竹' };
    if (cc) opts.cc = cc;
    var draft = GmailApp.createDraft(to, subject, body, opts);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, id: draft.getId(), attached: attachments.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// 自動バックアップ（毎日トリガーで実行）
// ==========================================
function dailyBackup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Clean Vibes');
  if (!sheet) return;

  var data = sheet.getRange('A1').getValue();
  if (!data) return;

  var backupSheet = ss.getSheetByName('Backups');
  if (!backupSheet) {
    backupSheet = ss.insertSheet('Backups');
    backupSheet.getRange('A1').setValue('日時');
    backupSheet.getRange('B1').setValue('データ');
  }

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  backupSheet.appendRow([now, data]);

  // 30世代まで保持（古いものを削除）
  var lastRow = backupSheet.getLastRow();
  if (lastRow > 31) {
    backupSheet.deleteRow(2);
  }
}

// トリガー設定（初回1回だけ実行）
function setupDailyBackup() {
  // 既存のトリガーを削除
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'dailyBackup') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // 毎日AM3時にバックアップ
  ScriptApp.newTrigger('dailyBackup')
    .timeBased()
    .atHour(3)
    .everyDays(1)
    .create();
}
