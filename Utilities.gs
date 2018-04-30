function checkSubmissions() {
  var doc = SpreadsheetApp.getActive();
  var formURL = doc.getFormUrl();
  var form = FormApp.openByUrl(formURL);
  var resp = form.getResponses();
  var out = [['timestamp', 'ID', 'email', 'title']];
  for (r in resp){
    var sub = resp[r].getItemResponses();
    var timestamp = resp[r].getTimestamp();
    var id = resp[r].getId();
    var email = sub[2].getResponse();
    var title = sub[7].getResponse();
    out.push([timestamp,id,email,title]);
  }
  var sheet = doc.getSheetByName('SubmissionCheck');
  sheet.getRange(1, 1, out.length, 4).setValues(out);
}

function createToken_(email, row, mode, reviewer_num){
  var hashedEmail = getHashedText(email);
  var blob = Utilities.newBlob(JSON.stringify({reviewer:hashedEmail,
                                               row: row,
                                               reviewer_num: reviewer_num,
                                               mode: mode}));
  return Utilities.base64EncodeWebSafe(blob.getBytes());
}

function decodeToken_(token){
  try {
    return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(token)).getDataAsString());
  } catch(e) {
    return {mode:'review'};
  }
}

function testToken(){
 var token ="eyJyZXZpZXdlciI6ImUyOTRhYWVmZDc2NTE5YWYyN2EzMjNhNjM0NDgzNWVhY2M4ZWZjMTViMTA0MWE1YjQ4NzI5NTdhNzI2N2FkOWYiLCJyb3ciOiI2MzkyYTgzOGJmODU5MWViMmUwZGRlNzZiOGQ5NjM2N2I5YWE0YWVlNGM5NWIyZWMxZTY4MmIzNGM0ZDg0ZWNjIiwicmV2aWV3ZXJfbnVtIjoxLCJtb2RlIjoicmV2aWV3In0=";
 var deToken = decodeToken_(token);
  Logger.log(deToken)
}

function getHashedText(email){
  var hash = CacheService.getScriptCache().get('HASH');
  if (!hash){
    hash = PropertiesService.getScriptProperties().getProperty('HASH');
    CacheService.getScriptCache().put('HASH', hash, 86000)
  }
  // based on https://stackoverflow.com/a/27933459
  var hashedEmail = Utilities.computeHmacSha256Signature(email,hash).reduce(function(str,chr){
    chr = (chr < 0 ? chr + 256 : chr).toString(16);
    return str + (chr.length==1?'0':'') + chr;
  },'');
  return hashedEmail;
}

function objectify(dataRange){
  // Fetch values for each row in the Range.
  var data = dataRange.getValues();
  var header = data.shift();
  // convert 2d array into object array
  // https://stackoverflow.com/a/22917499/1027723
  // for pretty version see https://mashe.hawksey.info/?p=17869/#comment-184945
  var obj = data.map(function(values) {
    return header.reduce(function(o, k, i) {
      o[k] = values[i];
      return o;
    }, {});
  });
  return obj;
}

// https://stackoverflow.com/a/1026087
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function getEmailTemplate(id){
  var emailTemp = SpreadsheetApp.getActive().getSheetByName('EmailTemplates');
  var emails = emailTemp.getDataRange();
  var email_obj = objectify(emails);
  return email_obj.filter(idFilter(id))[0];
}

function idFilter(id) {
    return function(element) {
      if (element.id === id){
        return element;
      }
    }
}

// Replaces markers in a template string with values define in a JavaScript data object.
// Arguments:
//   - template: string containing markers, for instance ${"Column name"}
//   - data: JavaScript object with values to that will replace markers. For instance
//           data.columnName will replace marker ${"Column name"}
// Returns a string without markers. If no data is found to replace a marker, it is
// simply removed.
function fillInTemplateFromObject(template, data) {
  var email = template;
  // Search for all the variables to be replaced, for instance ${"Column name"}
  var templateVars = template.match(/{([^}]+)}/g);

  // Replace variables from the template with the actual values from the data object.
  // If no value is available, replace with the empty string.
  for (var i = 0; i < templateVars.length; ++i) {
    // normalizeHeader ignores ${"} so we can call it directly here.
    var variableData = data[templateVars[i].substring(1,templateVars[i].length-1)];
    email = email.replace(templateVars[i], variableData || "");
  }

  return email;
}

//
function extractBracket(str){
  var rxp = /\(([^\)]+)\)/g;  
  var match;
  var matches = [];
  while ((match = rxp.exec(str)) != null) {
    matches.push(match);
  }
  return matches[matches.length-1][1];
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename)
    .getContent();
}

function refreshReviewStats(){
  var sheet = SpreadsheetApp.getActiveSheet();
  var headings = sheet.getDataRange()
  .offset(0, 0, 1)
  .getValues()[0];
  var formulas = sheet.getDataRange()
  .offset(0, 0, 1)
  .getFormulas()[0];
  Logger.log(formulas);
  var calcCols = ['Reviews Assigned', 'Reviews Submitted', 'Reviews Accepted', 'Reviews Declined', 'Reviews Reminded'];
  var calcFormula = { "Reviews Assigned":"=ARRAYFORMULA({\"Reviews Assigned\";COUNTIF('Form responses (DO NOT EDIT)'!AG:AM,J$2:J)})", 
                     "Reviews Submitted":"=ARRAYFORMULA({\"Reviews Submitted\";COUNTIF(Reviews!D:D,\"=\"&A2:A)})",
                     "Reviews Accepted":"=ARRAYFORMULA({\"Reviews Accepted\";COUNTIFS('Form responses (DO NOT EDIT)'!AG:AG,$J$2:J,'Form responses (DO NOT EDIT)'!AH:AH,\"review_accept\")+COUNTIFS('Form responses (DO NOT EDIT)'!AI:AI,$J$2:J,'Form responses (DO NOT EDIT)'!AJ:AJ,\"review_accept\")+COUNTIFS('Form responses (DO NOT EDIT)'!AK:AK,$J$2:J,'Form responses (DO NOT EDIT)'!AL:AL,\"review_accept\")+COUNTIFS('Form responses (DO NOT EDIT)'!AM:AM,$J$2:J,'Form responses (DO NOT EDIT)'!AN:AN,\"review_accept\")})", 
                     "Reviews Declined":"=ARRAYFORMULA({\"Reviews Declined\";COUNTIFS('Form responses (DO NOT EDIT)'!AG:AG,$J$2:J,'Form responses (DO NOT EDIT)'!AH:AH,\"review_decline\")+COUNTIFS('Form responses (DO NOT EDIT)'!AI:AI,$J$2:J,'Form responses (DO NOT EDIT)'!AJ:AJ,\"review_decline\")+COUNTIFS('Form responses (DO NOT EDIT)'!AK:AK,$J$2:J,'Form responses (DO NOT EDIT)'!AL:AL,\"review_decline\")+COUNTIFS('Form responses (DO NOT EDIT)'!AM:AM,$J$2:J,'Form responses (DO NOT EDIT)'!AN:AN,\"review_decline\")})", 
                     "Reviews Reminded":"=ARRAYFORMULA({\"Reviews Reminded\";COUNTIFS('Form responses (DO NOT EDIT)'!AG:AG,$J$2:J,'Form responses (DO NOT EDIT)'!AH:AH,\"review_reminded\")+COUNTIFS('Form responses (DO NOT EDIT)'!AI:AI,$J$2:J,'Form responses (DO NOT EDIT)'!AJ:AJ,\"review_reminded\")+COUNTIFS('Form responses (DO NOT EDIT)'!AK:AK,$J$2:J,'Form responses (DO NOT EDIT)'!AL:AL,\"review_reminded\")+COUNTIFS('Form responses (DO NOT EDIT)'!AM:AM,$J$2:J,'Form responses (DO NOT EDIT)'!AN:AN,\"review_reminded\")})"
                     };
  
  calcCols.forEach(function(source){
    var colIdx = headings.indexOf(source)+1;
    if (colIdx > 0 ){
      sheet.getRange(1, colIdx, sheet.getLastRow()).clearContent();
      sheet.getRange(1, colIdx).setFormula(calcFormula[source]);
      SpreadsheetApp.flush();
      var col = sheet.getRange(1, colIdx, sheet.getLastRow())
      var data = col.getValues();
      col.setValues(data);
    }
Logger.log(headings.indexOf(source));
});
}
