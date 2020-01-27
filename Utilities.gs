
function clearCache(){
  CacheService.getScriptCache().removeAll(['custom_fields','EDIT_SUBMISSIONS','ACCEPT_SUBMISSIONS']);
}

function getCustomFields_(){
  var value = CacheService.getScriptCache().get('custom_fields');
  if (!value){
    var doc = SpreadsheetApp.getActive();
    var range = doc.getSheetByName('custom_fields').getDataRange();
    var value =  JSON.stringify(objectify(range));
    CacheService.getScriptCache().put('custom_fields', value, 604800);
  }
  return value;
}

function getScriptProp_(key){
  var value = CacheService.getScriptCache().get(key);
  if (!value){
    var value = PropertiesService.getScriptProperties().getProperty(key);
    CacheService.getScriptCache().put(key, value, 8600);
  }
  return value;
}

function createToken_(email, row, mode, reviewer_num, id) {
  var hashedEmail = getHashedText(email);
  var blob = Utilities.newBlob(JSON.stringify({
    reviewer: hashedEmail,
    row: row,
    reviewer_num: reviewer_num,
    id: id,
    mode: mode
  }));
  return Utilities.base64EncodeWebSafe(blob.getBytes());
}

function decodeToken_(token) {
  try {
    return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(token)).getDataAsString());
  } catch (e) {
    return {
      mode: 'review'
    };
  }
}

function getHashedText(email) {
  var hash = CacheService.getScriptCache().get('HASH');
  if (!hash) {
    hash = PropertiesService.getScriptProperties().getProperty('HASH');
    CacheService.getScriptCache().put('HASH', hash, 86000)
  }
  // based on https://stackoverflow.com/a/27933459
  var hashedEmail = Utilities.computeHmacSha256Signature(email, hash).reduce(function(str, chr) {
    chr = (chr < 0 ? chr + 256 : chr).toString(16);
    return str + (chr.length == 1 ? '0' : '') + chr;
  }, '');
  return hashedEmail;
}

function objectify(dataRange) {
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

function getEmailTemplate(id) {
  var emailTemp = SpreadsheetApp.getActive().getSheetByName('EmailTemplates');
  var emails = emailTemp.getDataRange();
  var email_obj = objectify(emails);
  return email_obj.filter(idFilter(id))[0];
}

function getGmailTemplate(id) {
  var drafts = GmailApp.getDrafts();
  var draft = drafts.filter(subjectFilter(id))[0];
  for (var d=0; d<drafts.length; d++){
    var subject = drafts[d].getMessage().getSubject();
    if(subject===id){
      var draft = drafts[d];   
      break;
    }
  }
  var msg = draft.getMessage();
  return {text: msg.getPlainBody(), html:msg.getBody()};
}

function subjectFilter(id){
  return function(element) {
    if (element.getMessage().getSubject() === id) {
      return element;
    }
  }
}

function idFilter(id) {
  return function(element) {
    if (element.id === id) {
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
    var variableData = data[templateVars[i].substring(1, templateVars[i].length - 1)];
    email = email.replace(templateVars[i], variableData || "");
  }

  return email;
}

//
function extractBracket(str) {
  var rxp = /\(([^\)]+)\)/g;
  var match;
  var matches = [];
  while ((match = rxp.exec(str)) != null) {
    matches.push(match);
  }
  return matches[matches.length - 1][1];
}

function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent() //.createHtmlOutputFromFile(filename)
  //.getContent();
}

function refreshReviewStats() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var headings = sheet.getDataRange()
    .offset(0, 0, 1)
    .getValues()[0];
  var formulas = sheet.getDataRange()
    .offset(0, 0, 1)
    .getFormulas()[0];
  Logger.log(formulas);
  var calcCols = ['Reviews Assigned', 'Reviews Submitted', 'Reviews Accepted', 'Reviews Declined', 'Reviews Reminded'];
  var calcFormula = {
    "Reviews Assigned": "=ARRAYFORMULA({\"Reviews Assigned\";COUNTIF({Submissions!T:T,Submissions!V:V,Submissions!X:X,Submissions!Z:Z},B$2:B)})",
    "Reviews Submitted": "=ARRAYFORMULA({\"Reviews Submitted\";COUNTIF(Reviews!D:D,\"=\"&A2:A)})",
    "Reviews Accepted": "=ARRAYFORMULA({\"Reviews Accepted\";COUNTIFS(Reviewer1,$J$2:J,Review1Status,\"review_accept\")+COUNTIFS(Reviewer2,$J$2:J,Review2Status,\"review_accept\")+COUNTIFS(Reviewer3,$J$2:J,Review3Status,\"review_accept\")+COUNTIFS(Reviewer4,$J$2:J,Review4Status,\"review_accept\")})",
    "Reviews Declined": "=ARRAYFORMULA({\"Reviews Declined\";COUNTIFS(Reviewer1,$J$2:J,Review1Status,\"review_decline\")+COUNTIFS(Reviewer2,$J$2:J,Review2Status,\"review_decline\")+COUNTIFS(Reviewer3,$J$2:J,Review3Status,\"review_decline\")+COUNTIFS(Reviewer4,$J$2:J,Review4Status,\"review_decline\")})",
    "Reviews Reminded": "=ARRAYFORMULA({\"Reviews Reminded\";COUNTIFS(Reviewer1,$J$2:J,Review1Status,\"review_reminded\")+COUNTIFS(Reviewer2,$J$2:J,Review2Status,\"review_reminded\")+COUNTIFS(Reviewer3,$J$2:J,Review3Status,\"review_reminded\")+COUNTIFS(Reviewer4,$J$2:J,Review4Status,\"review_reminded\")})"
  };

  calcCols.forEach(function(source) {
    var colIdx = headings.indexOf(source) + 1;
    if (colIdx > 0) {
      sheet.getRange(1, colIdx, sheet.getLastRow()).clearContent();
      sheet.getRange(1, colIdx).setFormula(calcFormula[source]);
      SpreadsheetApp.flush();
      /*var col = sheet.getRange(1, colIdx, sheet.getLastRow())
      var data = col.getValues();
      col.setValues(data);*/
    }
  });
}

// https://stackoverflow.com/a/2998822
function pad(num, size) {
    var s = "000000000" + num;
    return s.substr(s.length-size);
}

/**
 * Filter By Color Setup Program Flow
 * Check whether color cell and filter columnn have been selected
 * If both selected, move to filter the data by color
 */
function filterByColorSetupUi() {
  
  var colorProperties = PropertiesService.getDocumentProperties();
  var colorCellRange = colorProperties.getProperty('colorCellRange');
  var filterColumnLetter = colorProperties.getProperty('filterColumnLetter');
  
  //if !colorCellRange
  if(!colorCellRange)  {
    title = 'Select Color Cell';
    msg = '<p>Please click on cell with the background color you want to filter on and then click OK</p>';
    msg += '<input type="button" value="OK" onclick="google.script.run.filterByColorHelper(1); google.script.host.close();" />';
    dispStatus(title, msg);
  }
  
  //if colorCellRange and !filterColumnLetter
  if (colorCellRange && !filterColumnLetter) {
      
      title = 'Select Filter Column';
      msg = '<p>Please highlight the column you want to filter, or click on a cell in that column. Click OK when you are ready.</p>';
      msg += '<input type="button" value="OK" onclick="google.script.run.filterByColorHelper(2); google.script.host.close();" />';
      dispStatus(title, msg);
  }
  
  // both color cell and filter column selected
  if(colorCellRange && filterColumnLetter) {
    
    title= 'Displaying Color Cell and Filter Column Ranges';
    msg = '<p>Confirm ranges before filtering:</p>';
    msg += 'Color Cell Range: ' + colorCellRange + '<br />Filter Column: ' + filterColumnLetter + '<br />';
    msg += '<br /><input type="button" value="Filter By Color" onclick="google.script.run.filterData(); google.script.host.close();" />';
    msg += '<br /><br /><input type="button" value="Clear Choices and Exit" onclick="google.script.run.clearProperties(); google.script.host.close();" />';
    dispStatus(title,msg);
    
  }
}


/**
 * display the modeless dialog box
 */
function dispStatus(title,html) {
  
  var title = typeof(title) !== 'undefined' ? title : 'No Title Provided';
  var html = typeof(html) !== 'undefined' ? html : '<p>No html provided.</p>';
  var htmlOutput = HtmlService
     .createHtmlOutput(html)
     .setWidth(350)
     .setHeight(200);
 
  SpreadsheetApp.getUi().showModelessDialog(htmlOutput, title);

}


/**
 * helper function to switch between dialog box 1 (to select color cell) and 2 (to select filter column)
 */
function filterByColorHelper(mode) {
  
  var mode = (typeof(mode) !== 'undefined')? mode : 0;
  switch(mode)
  {
    case 1:
      setColorCell();
      filterByColorSetupUi();
      break;
    case 2:
      setFilterColumn();
      filterByColorSetupUi();
      break;
    default:
      clearProperties();
  }
}

/** 
 * saves the color cell range to properties
 */
function setColorCell() {
  
  var sheet = SpreadsheetApp.getActiveSheet();
  var colorCell = SpreadsheetApp.getActiveRange().getA1Notation();
  var colorProperties = PropertiesService.getDocumentProperties();
  colorProperties.setProperty('colorCellRange', colorCell);

}

/**
 * saves the filter column range in properties
 */
function setFilterColumn() {
  
  var sheet = SpreadsheetApp.getActiveSheet();
  var filterColumn = SpreadsheetApp.getActiveRange().getA1Notation(); 
  var filterColumnLetter = filterColumn.split(':')[0].replace(/\d/g,'').toUpperCase(); // extracts column letter from whatever range has been highlighted for the filter column
  var colorProperties = PropertiesService.getDocumentProperties();
  colorProperties.setProperty('filterColumnLetter', filterColumnLetter);
  
}

/** 
 * filter the data based on color cell and chosen column
 */
function filterData() {
  
  // get the properties
  var colorProperties = PropertiesService.getDocumentProperties();
  var colorCell = colorProperties.getProperty('colorCellRange');
  var filterColumnLetter = colorProperties.getProperty('filterColumnLetter');
  
  // get the sheet
  var sheet = SpreadsheetApp.getActiveSheet();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  
  // get an array of background colors from the filter column
  var filterColBackgrounds = sheet.getRange(filterColumnLetter + 2 + ":" + filterColumnLetter + lastRow).getBackgrounds(); // assumes header in row 1
  
  // add a column heading to the array of background colors
  filterColBackgrounds.unshift(['Column ' + filterColumnLetter + ' background colors']);
  
  // paste the background colors array as a helper column on right side of data
  sheet.getRange(1,lastCol+1,lastRow,1).setValues(filterColBackgrounds);
  sheet.getRange(1,lastCol+1,1,1).setHorizontalAlignment('center').setFontWeight('bold').setWrap(true);
  
  // get the background color of the filter cell
  var filterColor = sheet.getRange(colorCell).getBackground();
  
  // remove existing filter to the data range
  if (sheet.getFilter() !== null) {
    sheet.getFilter().remove();
  }
  
  // add new filter across whole data table
  var newFilter = sheet.getDataRange().createFilter();
  
  // create new filter criteria
  var filterCriteria = SpreadsheetApp.newFilterCriteria();
  filterCriteria.whenTextEqualTo(filterColor);
  
  // apply the filter color as the filter value
  newFilter.setColumnFilterCriteria(lastCol + 1, filterCriteria);
  
  // clear out the properties so it's ready to run again
  clearProperties();
}

/**
 * clear the properties
 */
function clearProperties() {
  PropertiesService.getDocumentProperties().deleteAllProperties();
}