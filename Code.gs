// @OnlyCurrentDoc

var SUB_SHEET_NAME = "Form responses (DO NOT EDIT)";
var REV_SHEET_NAME = "Reviewers";
var REVIEW_SHEET_NAME = "Reviews";

// Dev
var REVIEW_URL = "https://script.google.com/macros/s/AKfycbwVMZocG3xPzNKyCvA36XIMo5xQ2wq6SLowKACNYSoBDwve-SM/exec";

// Prod.
// var REVIEW_URL = "https://script.google.com/macros/s/AKfycbxNtXYjjLKafhqwjJD2lS-NoKadVMQYiUUsd-JXDieOPYW4IFc/exec";

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  // Or DocumentApp or FormApp.
  ui.createMenu('Review System')
      .addItem('Submission Details', 'showSummary')
      .addItem('Check submission email', 'checkAuthor')
      .addItem('Build Reviewer Lists', 'buildReviewerLists')
      .addItem('Send Reviewer Notifications', 'sendReviewerNotification')
      .addItem('Send Reviewer Reminder', 'sendReviewerReminder')
      .addToUi();
}

function showSummary() {
  var html = HtmlService.createTemplateFromFile('Summary')
  html.currentRow = SpreadsheetApp.getActiveSheet().getActiveRange().getRow();
  html.isAdmin = true;
  html.mode = 'admin';
  SpreadsheetApp.getUi() // Or DocumentApp or FormApp.
  .showModalDialog(html.evaluate().setWidth(1200).setHeight(800), 'Submission Review');
}

function doGet(e){
  var token = e.parameter.token
  var data = decodeToken_(token);
  var html = HtmlService.createTemplateFromFile('Summary');
  html.reviewer_token = data.reviewer;
  html.reviewer_num = data.reviewer_num;
  html.review_token = data.row;
  html.token = token;
  html.mode = data.mode;
  html.isAdmin = false;
  return html.evaluate()
             .setTitle("ALT - Review System")
             .setFaviconUrl('https://www.alt.ac.uk/sites/alt.ac.uk/files/files/favicon.ico')
             .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function checkAuthor(){
  var email = getEmailTemplate('check_author');
  var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
  var subs = sheet.getDataRange();
  var sub_obj = objectify(subs)
  var headings = sheet.getDataRange()
                      .offset(0, 0, 1)
                      .getValues()[0];
  var incCol = headings.indexOf('Include');
  var sub_filtered = sub_obj.filter(function(s){
    if (s['Include'] === 'check_author'){
      var subject = fillInTemplateFromObject(email.subject, s);
      var body = fillInTemplateFromObject(email.text, s);
      var recipient = s['Email address (for communication only)']
      MailApp.sendEmail(recipient, subject, body, {cc:'systems@alt.ac.uk',replyTo:'helpdesk@alt.ac.uk'});
      var row = parseInt(s.ID.match(/\d+$/)[0]);
      sheet.getRange(row+1, incCol+1).setValue('check_author')
                                       .setNote('check_author by: '+
                                                Session.getActiveUser().getEmail()+'\nDate: ' + 
                                                Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm'));
    }
  });
}

function sendReviewerNotification(){
  var email = getEmailTemplate('assign_reviewer');
  sendReviewerEmails_(email, 'assigned');
}

function sendReviewerReminder(){
  var email = getEmailTemplate('remind_reviewer');
  var days = parseInt(Browser.inputBox('Number of days since assigned to remind'));
  sendReviewerEmails_(email, 'reminded', days);
}

function sendReviewerEmails_(email, type, days){
  var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
  var subs = sheet.getDataRange();
  var sub_obj = objectify(subs)
  var headings = sheet.getDataRange()
                      .offset(0, 0, 1)
                      .getValues()[0];
  var incCol = headings.indexOf('Include');
  var revCols = [];
  for (var r = 1; r < 5; r++){
    revCols.push(headings.indexOf('Reviewer'+r)+1);
  }
  var sub_filtered = sub_obj.filter(function(s){
    if (s['Include'] === 'yes'){
      var row = parseInt(s.ID.match(/\d+$/)[0])+1;
      for (var r = 1; r < 5; r++){
        
        var colReviewer = revCols[r-1];
        var colReviewStatus = colReviewer+1;
        var note = sheet.getRange(row, colReviewStatus).getNote();
        if (testEmailCase_(type, s, r, {sheet:sheet, row:row, column:colReviewStatus, days:days})){
          // send email 
          var recipient = extractBracket(s['Reviewer'+r]);
          var url = UrlShortener.Url.insert({
            longUrl: REVIEW_URL+'?token='+createToken_(recipient, s['Hashed ID'], 'review', r)
          });
          s.review_url = url.id;
          var subject = fillInTemplateFromObject(email.subject, s);
          var body = fillInTemplateFromObject(email.text, s);
          try {
            MailApp.sendEmail(recipient, subject, body, {cc:'systems@alt.ac.uk',replyTo:'helpdesk@alt.ac.uk'});
            // record on sheet

            sheet.getRange(row, colReviewStatus).setValue('review_'+type)
                                       .setNote(capitalizeFirstLetter(type)+' by: '+
                                                Session.getActiveUser().getEmail() + '\nTo: '+
                                                recipient +'\nDate: ' + 
                                                Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm'));
          } catch(e) {
            sheet.getRange(row, colReviewStatus).setValue('error_'+type)
                                       .setNote('Error '+capitalizeFirstLetter(type)+' by: '+
                                                Session.getActiveUser().getEmail()+'\nDate: ' + 
                                                Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm') +
                                                'Msg '+e.message );
          }
        }
      }
      
    }   
  });
}

function testEmailCase_(type, s, r, reminder){
  if (type === 'assigned'){
    if (s['Reviewer'+r] !== "" && s['Review'+r+' Status'] ===""){
      return true; 
    }
  } else if (type === 'reminded'){
    if (s['Review'+r+' Status'] === 'review_assigned'){
      var note = reminder.sheet.getRange(reminder.row, reminder.column).getNote();
      var dateString = note.match(/\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}/);
      var note_date = (new Date().getTime()-new Date(dateString).getTime())/(1000*60*60*24);      
      if (note_date > reminder.days){        
        return true;
      }
    }
  } else {
    return false
  }
  return false;
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename)
      .getContent();
}

function buildReviewerLists(){
  var review_sheet = SpreadsheetApp.getActive().getSheetByName(REV_SHEET_NAME);
  var reviewers = review_sheet.getDataRange();
  var rev = objectify(reviewers);
  
  var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
  var subs = sheet.getDataRange();
  var data = subs.getValues();
  data.shift();
  var headings = sheet.getDataRange()
                    .offset(0, 0, 1)
                    .getValues()[0];
  var incCol = headings.indexOf('Include');
  var secCol = headings.indexOf('Which sector(s) are you based in?');
  var typeCol = headings.indexOf('Select what kind of session you\'d like to run:');
  var revCols = [];
  for (var r = 1; r < 5; r++){
    revCols.push(headings.indexOf('Reviewer'+r));
  }
  
  // Reviewer Rules 
  var nonHERevRule = reviewGroupRule(rev, 'Proposals from FE/Vocational/Adult Education'); 
  var researcherRule = reviewGroupRule(rev, 'Research papers (with route to journal publication)'); 
  var workshopRule = reviewGroupRule(rev, 'Interactive/workshop proposals'); 
  var shortPrezRule = reviewGroupRule(rev, 'Proposals for short presentations/lightning talks/posters'); 
  
  // apply data validatation rules  
  for (var i = 0; i < data.length; i++){
    if (data[i][incCol] === 'yes'){
      if (data[i][secCol].indexOf('Higher Education') < 0){
        // if Proposals from FE/Vocational/Adult Education
        applyRule(sheet, i+2, revCols, nonHERevRule);
      } else if (data[i][typeCol].indexOf('Research session') > -1) {
        // else if Research papers (with route to journal publication)
        applyRule(sheet, i+2, revCols, researcherRule);
      } else if (data[i][typeCol].indexOf('Discussion panel') > -1 || data[i][typeCol].indexOf('experimental session') > -1 || data[i][typeCol].indexOf('Workshop or demonstration') > -1 ) {
        // else if Interactive/workshop proposals
        applyRule(sheet, i+2, revCols, workshopRule);
      } else {
        // else if Proposals for short presentations/lightning talks/posters
        applyRule(sheet, i+2, revCols, shortPrezRule);
      }
    }
  }
}

function reviewGroupRule(rev, type){
  var subgroup = rev.reduce(function(filtered, r){
    if (r['Help shape the programme'].indexOf(type) !== -1){
      filtered.push( r['Select String']);
    }
    return filtered
  },[]);
  return SpreadsheetApp.newDataValidation().requireValueInList(subgroup, true).build();
}

function applyRule(sheet, row, revCols, rule){
  for (var r = 0; r < revCols.length; r++){
    sheet.getRange(row, revCols[r]+1).setDataValidation(rule);
  }
}

