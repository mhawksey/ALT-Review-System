function setReviewerStatus(review_token, reviewer_token, reviewer_num, type){
  updateReviewColumn_(review_token, reviewer_token, reviewer_num, type);
  return {result: 'ok', review_status:type}
}

function updateReviewColumn_(review_token, reviewer_token, reviewer_num, type){
  console.time('updateReviewColumn_');

  // fetch submission from review_token
  var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
  // Fetch the range of cells A1:B3
  var dataRange = sheet.getRange("A:AN");
  var dataValues = dataRange.getValues();
  var dataValuesHeader = dataValues.shift(); 
  var subs = objectify(dataRange);
  var sub = subs.filter(function(r){
    if (r['Hashed ID'] === review_token){
      return r
    }
  });
  
  // fetch review status from review
  var rev_sheet = SpreadsheetApp.getActive().getSheetByName(REV_SHEET_NAME);
  var dataRange = rev_sheet.getDataRange();
  var reviewers = objectify(dataRange);
  var reviewer = reviewers.filter(function(rev){
    if (rev['ID'] === reviewer_token){
      return rev
    }
  });
  var review_select = reviewer[0]['Select String'];
  var assigned_reviewer = sub[0]['Reviewer'+reviewer_num];
  sub[0].review_status = sub[0]['Review'+reviewer_num+' Status']
  
  if (review_select !== assigned_reviewer){
   throw "Reviewer Mismatch"; 
  }
  for (var r = 0; r < dataValues.length; r++){
    if (dataValues[r][dataValuesHeader.indexOf('Hashed ID')] === review_token){
      sheet.getRange(r+2, dataValuesHeader.indexOf('Review'+reviewer_num+' Status')+1).setValue(type)
                                                                                      .setNote(type+' '+reviewer[0]['Select String']+'\nDate: ' +
                                                                                               Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm'));
    }
  }
  console.timeEnd('updateReviewColumn_');
  return reviewer[0]['Select String'];
}

function getReviewData(review_token, reviewer_token, reviewer_num){
  console.time('getReviewData');

  // fetch submission from review_token
  var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
  // Fetch the range of cells A1:B3
  var dataRange = sheet.getRange("G:AN");
  var subs = objectify(dataRange);
  var sub = subs.filter(function(r){
    if (r['Hashed ID'] === review_token){
      return r
    }
  });

  
  // fetch review status from review
  var sheet = SpreadsheetApp.getActive().getSheetByName(REV_SHEET_NAME);
  var dataRange = sheet.getDataRange();
  var reviewers = objectify(dataRange);
  var reviewer = reviewers.filter(function(rev){
    if (rev['ID'] === reviewer_token){
      return rev
    }
  });
  var review_select = reviewer[0]['Select String'];
  var assigned_reviewer = sub[0]['Reviewer'+reviewer_num];
  sub[0].review_status = sub[0]['Review'+reviewer_num+' Status']
  
  if (review_select !== assigned_reviewer){
   throw "Reviewer Mismatch"; 
  }
  for (el in sub[0]){
    if(el.indexOf('Additional')>-1 || el.indexOf('Review')>-1){
      delete sub[0][el];
    }
  }
  return sub[0];
  console.timeEnd('getReviewData')
}

function getData(){
  var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
  // Fetch the range of cells A1:B3
  var dataRange = sheet.getDataRange();
  return JSON.stringify(objectify(dataRange));
}

function setReviewStatus(row, el){
  var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
  var headings = sheet.getDataRange()
                    .offset(0, 0, 1)
                    .getValues()[0];
  var column = headings.indexOf('Include')+1;
  var value = el.split('_')[0];
  sheet.getRange(row, column).setValue(value)
  return el;
}

function processReviewForm(formData){
  // https://stackoverflow.com/a/43238894
  // BEGIN - start lock here
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // wait 30 seconds for others' use of the code section and lock to stop and then proceed
  } catch (e) {
    return {result: 'error', message:'Could not obtain lock'}; 
  }
  
  // note:  if return is run in the catch block above the following will not run as the function will be exited
  var sheet = SpreadsheetApp.getActive().getSheetByName(REVIEW_SHEET_NAME);
  var heads = sheet.getDataRange()
                    .offset(0, 0, 1)
                    .getValues()[0];
  sheet.insertRowAfter(1);
  formData.timestamp = new Date();
  
  var row = heads.map(function(cell){
    if (Array.isArray(formData[cell])){
      return formData[cell].join(', ');
    } else {
      return formData[cell] || "";
    }
  });
  // write result
  sheet.getRange(2, 1, 1, row.length).setValues([row]).setFontWeight('normal');  
  var email = updateReviewColumn_(formData.review_token, formData.reviewer_token, formData.reviewer_num, formData.feedback_decision);
  SpreadsheetApp.flush(); // applies all pending spreadsheet changes
  lock.releaseLock();
  var recipient = extractBracket(email);
  var email = getEmailTemplate('thank_reviewer');
  var subject = fillInTemplateFromObject(email.subject, formData);
  var body = fillInTemplateFromObject(email.text, formData);
  try {
    MailApp.sendEmail(recipient, subject, body, {cc:'systems@alt.ac.uk',replyTo:'helpdesk@alt.ac.uk'});
  } catch(e) {
    MailApp.sendEmail('martin.hawksey@alt.ac.uk', 'ALT Review System Error', JSON.stringify(formData, null, '\t'));
  }
  // END - end lock here
  return {result:'ok'};
}