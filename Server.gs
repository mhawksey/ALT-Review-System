function setReviewerStatus(review_token, reviewer_token, reviewer_num, type){
  console.time('setReviewerStatus');

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
      sheet.getRange(r+2, dataValuesHeader.indexOf('Review'+reviewer_num+' Status')+1).setValue(type).setNote(type+' '+reviewer[0]['Select String']+' '+new Date());
    }
  }
  console.timeEnd('setReviewerStatus');
  return {result: 'ok', review_status:type};
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