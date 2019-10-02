var SUB_SHEET_NAME = "Submissions";
var REV_SHEET_NAME = "Reviewers";
var REVIEW_SHEET_NAME = "Reviews";
var ORIG_SUB_SHEET_NAME = "OriginalSubmissions"
var ID_PREFIX = 'A-';
var EMAIL_FROM = 'helpdesk@alt.ac.uk';
var EMAIL_CC = 'systems@alt.ac.uk';
var ACCEPT_SUBMISSIONS = getScriptProp_('ACCEPT_SUBMISSIONS');
var EDIT_SUBMISSIONS = getScriptProp_('EDIT_SUBMISSIONS');

// Dev
//var REVIEW_URL = "https://script.google.com/a/alt.ac.uk/macros/s/AKfycbxzAoNlhsqRUuPJuM1hLhbFGJd_6DgK2olUTrQF0MQ/dev";

// Prod.
var REVIEW_URL = "https://script.google.com/macros/s/AKfycby8mr252cLqw7xjdznvcQIGkNzkLk5UZE6GFzapXtOA22VyQz4/exec";

/**
 * On open
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  // Or DocumentApp or FormApp.
  ui.createMenu('Review System')
    .addItem('Build Reviewer Lists', 'buildReviewerLists')
    .addSubMenu(ui.createMenu('Admin Inferface')
      .addItem('Submission Details Check', 'showSummary')
      .addItem('Round 1 Review Decisions Admin', 'showReviewAdminRound1')
      .addItem('Final Decisions Admin', 'showReviewAdminRound2'))
    .addSubMenu(ui.createMenu('Email Notifications')
      .addItem('Send test email', 'sendTestEmail')
      .addItem('Send check with author email (check_author)', 'checkAuthor')
      .addItem('Send Reviewer Notifications (assign_reviewer)', 'sendReviewerNotification')
      .addItem('Send Reviewer Reminder (remind_reviewer)', 'sendReviewerReminder')
      .addItem('Send Reviewer Reminder for accepted reviews (remind_reviewer_accepted)', 'sendReviewerReminderAccepted')
      .addItem('Send Decisions (proposal_)', 'sendReviewDecisions')
      .addItem('Send Decisions Reminder (R_proposal_)', 'sendReviewDecisionsReminder')
      .addItem('Send Final Decisions (2_proposal_)', 'sendFinalDecsions')
      .addItem('Send message to all filtered submissions (notify_authors)', 'notifyAuthors'))
    .addToUi();
}

function setup(){
  // add columns to submission sheet
  // add hash to script properties 
  // switch on Sheets Advanced service and URLShortner
  // add column validation
}

/**
 * Show proposal data for admin
 */
function showSummary() {
  showDialog('review_submissions');
}

/**
 * Show proposal data with reviews for Round 1 admin
 */
function showReviewAdminRound1() {
  showDialog('reviewAdmin');
}

/**
 * Show proposal data with reviews for Round 2 admin
 */
function showReviewAdminRound2() {
  showDialog('reviewAdmin2');
}

/**
 * Show proposal data for admin
 */
function showDialog(mode) {
  var custom_fields = getCustomFields_();
  var currentRow = SpreadsheetApp.getActiveSheet().getActiveRange().getRow();
  var html = HtmlService.createTemplateFromFile('ui/index')
  html.currentRow = (currentRow < 2) ? 2 : currentRow;
  html.isModal = true;
  html.mode = mode;
  html.custom_fields = custom_fields;
  html.data = '';
  SpreadsheetApp.getUi()
    .showModalDialog(html.evaluate().setWidth(1200).setHeight(800), 'Submission Review');
}

/**
 * Web app for reviewers and authors
 * @param {Object} e parameters.
 * @return {HtmlService} returns result.
 */
function doGet(e) {
  var title = "ALT - Submission System";
  var custom_fields = getCustomFields_();
  var html = HtmlService.createTemplateFromFile('ui/404');
  html.custom_fields = custom_fields;
  
  /*if (!e.parameter.action){
    e.parameter.action = 'decision';
  }*/
  
  if (e.parameter.action){
    if ((e.parameter.action == 'new' && ACCEPT_SUBMISSIONS !== 'closed') || 
        (e.parameter.action == 'edit' && EDIT_SUBMISSIONS !== 'closed') || 
        (e.parameter.action == 'decision') ||
        (e.parameter.action == 'review')){
        
          if (e.parameter.action == 'review'){
            var html = HtmlService.createTemplateFromFile('ui/index');
          } else {
            var html = HtmlService.createTemplateFromFile('ui/index');
          }
        
        html.custom_fields = custom_fields;
        html.mode = e.parameter.action;
        html.isModal = false;
        html.data = 'notoken';
        
        if (e.parameter.token){
          //var token = e.parameter.token;
          html.data = e.parameter.token;
          var token = decodeToken_(e.parameter.token);
          if (token.id) title = token.id + ' - ALT Review Form';
        } 
      } 
  }
  return html.evaluate()
    .setTitle(title)
    .setFaviconUrl('https://www.alt.ac.uk/sites/alt.ac.uk/files/files/favicon.ico')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Send test email.
 */
function sendTestEmail() {
  var template = Browser.inputBox("Sending emails", 'Enter the template id you wish to send a test email to:', Browser.Buttons.OK_CANCEL);
  if (template !== "cancel") {
    // get all submissions
    var email = getEmailTemplate(template);
    var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
    var subs = sheet.getDataRange();
    var sub_obj = objectify(subs)
    var headings = sheet.getDataRange()
      .offset(0, 0, 1)
      .getValues()[0];
    var incCol = headings.indexOf('Include');
    // iterate for submissions with check_author in Include column
    var sub_filtered = sub_obj.filter(function(s) {
      if (s['Include'] === 'test') {
        var subject = fillInTemplateFromObject(email.subject, s);
        var body = fillInTemplateFromObject(email.text, s);
        var recipient = Session.getActiveUser().getEmail()
        GmailApp.sendEmail(recipient, subject, body, {
          cc: 'systems@alt.ac.uk',
          replyTo: 'helpdesk@alt.ac.uk'
        });
        var row = parseInt(s.ID.match(/\d+$/)[0], 10);
        // record email has been sent
        sheet.getRange(row + 1, incCol + 1).setNote(template + ' sent by: ' +
          Session.getActiveUser().getEmail() + '\nDate: ' +
          Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm'));
      }
    });
  }
}

/**
 * Sends email to notify them proposal isn't going to be reviewed.
 */
function checkAuthor() {
  var resp = Browser.msgBox("Sending emails", "You are about to send emails to authors with 'check' in the Include column. Are you sure?", Browser.Buttons.YES_NO);
  if (resp === 'yes') {
    // get all submissions
    var email = getEmailTemplate('check_author');
    var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
    var subs = sheet.getDataRange();
    var sub_obj = objectify(subs)
    var headings = sheet.getDataRange()
      .offset(0, 0, 1)
      .getValues()[0];
    var incCol = headings.indexOf('Include');
    // iterate for submissions with check_author in Include column
    var sub_filtered = sub_obj.filter(function(s) {
      if (s['Include'] === 'check') {
        var subject = fillInTemplateFromObject(email.subject, s);
        var body = fillInTemplateFromObject(email.text, s);
        var recipient = s.email
        GmailApp.sendEmail(recipient, subject, body, {
          cc: 'systems@alt.ac.uk',
          replyTo: 'helpdesk@alt.ac.uk',
          from:'helpdesk@alt.ac.uk'
        });
        var row = parseInt(s.ID.match(/\d+$/)[0], 10);
        // record email has been sent
        sheet.getRange(row + 1, incCol + 1).setValue('check_author_sent')
          .setNote('check by: ' +
            Session.getActiveUser().getEmail() + '\nDate: ' +
            Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm'));
      }
    });
  }
}
/**
 * Sends email to all lead authors.
 */
function notifyAuthors() {
  var resp = Browser.msgBox("Sending emails", "You are about to send emails (notify_authors) to all authors that have been filtered. Are you sure?", Browser.Buttons.YES_NO);
  if (resp === 'yes') {
    // get all submissions
    var email = getEmailTemplate('notify_authors');
    var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
    var subs = sheet.getDataRange();
    var sub_obj = objectify(subs);
    sub_obj = addFilteredRows_(SpreadsheetApp.getActive().getId(), sheet.getSheetId(), sub_obj);
    var headings = sheet.getDataRange()
      .offset(0, 0, 1)
      .getValues()[0];
    var incCol = headings.indexOf('Include');
    // iterate for submissions with check_author in Include column
    var sub_filtered = sub_obj.filter(function(s) {
      if (!s['hidden']) {
        var recipient = s.email;
        /*var url = UrlShortener.Url.insert({
          longUrl: REVIEW_URL + '?action=decision&token=' + createToken_(recipient, s.hashed_id, 'decision', 1)
        });
        s.review_url = url.id;*/
        var subject = fillInTemplateFromObject(email.subject, s);
        var body = fillInTemplateFromObject(email.text, s);
        
        GmailApp.sendEmail(recipient, subject, body, {
          cc: 'systems@alt.ac.uk',
          //replyTo: 'enquiries@alt.ac.uk'
          replyTo: 'helpdesk@alt.ac.uk'
        });
        var row = parseInt(s.ID.match(/\d+$/)[0], 10);
        // record email has been sent
        sheet.getRange(row + 1, incCol + 1).setNote('notify_authors sent by: ' +
          Session.getActiveUser().getEmail() + '\nDate: ' +
          Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm'));
      }
    });
  }
}

/**
 * Sends email to all lead authors from Gmail draft.
 */
function notifyAuthorsFromGmail() {
  var resp = Browser.msgBox("Sending emails", "You are about to send emails to all authors that have been filtered. Are you sure?", Browser.Buttons.YES_NO);
  if (resp === 'yes') {
    // get all submissions
    var subjectLine = '[Action Required] ALT Annual Conference 2019: Media Permission [Ref: {ID}]';
    var email = getGmailTemplate(subjectLine);
    var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
    var subs = sheet.getDataRange();
    var sub_obj = objectify(subs);
    sub_obj = addFilteredRows_(SpreadsheetApp.getActive().getId(), sheet.getSheetId(), sub_obj);
    var headings = sheet.getDataRange()
      .offset(0, 0, 1)
      .getValues()[0];
    var incCol = headings.indexOf('Include');
    // iterate for submissions with check_author in Include column
    var sub_filtered = sub_obj.filter(function(s) {
      if (!s['hidden'] && s.email !== "") {
        var subject = fillInTemplateFromObject(subjectLine, s);
        var body = fillInTemplateFromObject(email.text, s);
        var htmlBody = fillInTemplateFromObject(email.html, s)
        var recipient = s.email
       GmailApp.sendEmail(recipient, subject, body, {
          bcc: 'systems@alt.ac.uk',
          replyTo: 'helpdesk@alt.ac.uk',
          name:'ALT Helpdesk',
          htmlBody: htmlBody
        });
        var row = parseInt(s.ID.match(/\d+$/)[0], 10);
        // record email has been sent
        sheet.getRange(row + 1, incCol + 1).setNote('Gmail Draft - Permission sent by: ' +
          Session.getActiveUser().getEmail() + '\nDate: ' +
          Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm'));
      }
    });
  }
}

/**
 * Send review decision to lead authors.
 */
function sendReviewDecisions() {
  var resp = Browser.msgBox("Sending emails", "You are about to send emails for review decisions. Are you sure?", Browser.Buttons.YES_NO);
  if (resp === 'yes') {
    // get all submissions
    var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
    var dataRange = sheet.getDataRange();
    var sub_obj = objectify(dataRange);
    sub_obj = addFilteredRows_(SpreadsheetApp.getActive().getId(), sheet.getSheetId(), sub_obj);

    var headings = sheet.getDataRange()
      .offset(0, 0, 1)
      .getValues()[0];
    var desCol = headings.indexOf('Decision Status R1');
    var sub_filtered = sub_obj.filter(function(s) {
      if (s['Decision R1'] !== '' && s['Decision Status R1'] === 'saved' && !s['hidden']) {
        var recipient = s.email
        var url = UrlShortener.Url.insert({
          longUrl: REVIEW_URL + '?action=decision&token=' + createToken_(recipient, s.hashed_id, 'decision', 1)
        });
        s.review_url = url.id;
        var email = getEmailTemplate('proposal_' + s['Decision R1']);
        var subject = fillInTemplateFromObject(email.subject, s);
        var body = fillInTemplateFromObject(email.text, s);
        try {
          GmailApp.sendEmail(recipient, subject, body, {
            cc: 'systems@alt.ac.uk',
            replyTo: 'helpdesk@alt.ac.uk'
          });
          var row = parseInt(s.ID.match(/\d+$/)[0], 10);
          // record email has been sent
          sheet.getRange(row + 1, desCol + 1).setValue('sent')
            .setNote(s['Decision R1'] + '_proposal sent by: ' + Session.getActiveUser().getEmail() + 
                '\nTo: ' + recipient +
                '\nURL: ' + s.review_url + 
                '\nDate: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm'));
        } catch (e) {
          sheet.getRange(row + 1, desCol + 1).setValue('error')
            .setNote(s['Decision R1'] + '_proposal sent by: ' +
              Session.getActiveUser().getEmail() + '\nDate: ' +
              Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm') + '\n' +
              'Msg ' + e.message);
        }
      }
    });
  }
}

/**
 * Send review decision reminder to lead authors.
 */
function sendReviewDecisionsReminder() {
  var resp = Browser.msgBox("Sending emails", "You are about to send emails for review decisions reminder. Are you sure?", Browser.Buttons.YES_NO);
  if (resp === 'yes') {
    // get all submissions
    var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
    var dataRange = sheet.getDataRange();
    var sub_obj = objectify(dataRange);
    sub_obj = addFilteredRows_(SpreadsheetApp.getActive().getId(), sheet.getSheetId(), sub_obj);

    var headings = sheet.getDataRange()
      .offset(0, 0, 1)
      .getValues()[0];
    var desCol = headings.indexOf('Decision Status R1');
    var sub_filtered = sub_obj.filter(function(s) {
      if (s['Decision R1'] !== '' && s['Decision R1'] !== 'reject' && s['Decision Status R1'] === 'sent' && s['Submission Status'] !== 'updated' && !s['hidden']) {
        var recipient = s.email
        var url = UrlShortener.Url.insert({
          longUrl: REVIEW_URL + '?action=decision&token=' + createToken_(recipient, s.hashed_id, 'decision', 1)
        });
        s.review_url = url.id;
        var email = getEmailTemplate('R_proposal_' + s['Decision R1']);
        var subject = fillInTemplateFromObject(email.subject, s);
        var body = fillInTemplateFromObject(email.text, s);
        try {
          GmailApp.sendEmail(recipient, subject, body, {
            cc: 'systems@alt.ac.uk',
            replyTo: 'helpdesk@alt.ac.uk'
          });
          var row = parseInt(s.ID.match(/\d+$/)[0], 10);
          // record email has been sent
          sheet.getRange(row + 1, desCol + 1).setValue('reminder_sent')
            .setNote('R_proposal_'+s['Decision R1']+' sent by: ' + Session.getActiveUser().getEmail() + 
                '\nTo: ' + recipient +
                '\nURL: ' + s.review_url + 
                '\nDate: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm'));
        } catch (e) {
          sheet.getRange(row + 1, desCol + 1).setValue('error')
            .setNote('R_proposal_'+s['Decision R1']+' sent by: ' +
              Session.getActiveUser().getEmail() + '\nDate: ' +
              Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm') + '\n' +
              'Msg ' + e.message);
        }
      }
    });
  }
}

/**
 * Send final decision to lead authors.
 */
function sendFinalDecsions() {
  var resp = Browser.msgBox("Sending emails", "You are about to send emails for final decisions. Are you sure?", Browser.Buttons.YES_NO);
  if (resp === 'yes') {
    // get all submissions
    var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
    var dataRange = sheet.getDataRange();
    var sub_obj = objectify(dataRange);
    sub_obj = addFilteredRows_(SpreadsheetApp.getActive().getId(), sheet.getSheetId(), sub_obj);

    var headings = sheet.getDataRange()
      .offset(0, 0, 1)
      .getValues()[0];
    var desCol = headings.indexOf('Final Decision Status');
    var sub_filtered = sub_obj.filter(function(s) {
      if (s['Final Decision'] !== '' && s['Final Decision Status'] === 'saved' && !s['hidden']) {
        var recipient = s.email
        var email = getEmailTemplate('2_proposal_' + s['Final Decision']);
        var subject = fillInTemplateFromObject(email.subject, s);
        var body = fillInTemplateFromObject(email.text, s);
        try {
          GmailApp.sendEmail(recipient, subject, body, {
            cc: 'systems@alt.ac.uk',
            replyTo: 'helpdesk@alt.ac.uk'
          });
          var row = parseInt(s.ID.match(/\d+$/)[0], 10);
          // record email has been sent
          sheet.getRange(row + 1, desCol + 1).setValue('sent')
            .setNote('2_proposal_' + s['Final Decision'] + ' sent by: ' + Session.getActiveUser().getEmail() + 
                '\nTo: ' + recipient +
                '\nDate: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm'));
        } catch (e) {
          console.error('sendFinalDecsions() error: ' + e);
          sheet.getRange(row + 1, desCol + 1).setValue('error')
            .setNote('2_proposal_' + s['Final Decision'] + ' sent by: ' +
              Session.getActiveUser().getEmail() + '\nDate: ' +
              Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm') + '\n' +
              'Msg ' + e.message);
        }
      }
    });
  }
}

/**
 * Sends email notifications to reviewers with link to review submission.
 */
function sendReviewerNotification() {
  var resp = Browser.msgBox("Sending emails", "You are about to send reviewer email notifications. Are you sure?", Browser.Buttons.YES_NO);
  if (resp === 'yes') {
    var email = getEmailTemplate('assign_reviewer');
    sendReviewerEmails_(email, 'assigned');
  }
}
/**
 * Sends email reminder to reviewers with link to review submission.
 */
function sendReviewerReminder() {
  var email = getEmailTemplate('remind_reviewer');
  var days = parseInt(Browser.inputBox('Number of days since assigned to send remind_reviewer'));
  sendReviewerEmails_(email, 'reminded', days);
}

/**
 * Sends email reminder to reviewers who have accepted with link to review submission.
 */
function sendReviewerReminderAccepted() {
  var resp = Browser.msgBox("Sending emails", "You are about to send reviewer reminder emails to reviewers who have accepted reviews but not provided feedback (remind_reviewer_accepted). Are you sure?", Browser.Buttons.YES_NO);
  if (resp === 'yes') {
    var email = getEmailTemplate('remind_reviewer_accepted');
    sendReviewerEmails_(email, 'accept');
  }
}

/**
 * Private function to send emails
 * @param {Object} email template.
 * @param {string} type of email (review_assign || review_remind).
 * @param {Number} days if a reminder to use as cutoff.
 */
function sendReviewerEmails_(email, type, days) {
  // get all submissions
  var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
  var subs = sheet.getDataRange();
  var sub_obj = objectify(subs);
  sub_obj = addFilteredRows_(SpreadsheetApp.getActive().getId(), sheet.getSheetId(), sub_obj);
  var headings = sheet.getDataRange()
    .offset(0, 0, 1)
    .getValues()[0];
  var incCol = headings.indexOf('Include');
  var revCols = [];
  for (var r = 1; r < 5; r++) {
    revCols.push(headings.indexOf('Reviewer' + r) + 1);
  }
  // filter where Include column is 'yes'
  var sub_filtered = sub_obj.filter(function(s) {
    if (s['Include'] === 'yes' && !s['hidden']) {
      var row = parseInt(s.ID.match(/\d+$/)[0], 10) + 1;
      for (var r = 1; r < 5; r++) {

        var colReviewer = revCols[r - 1];
        var colReviewStatus = colReviewer + 1;
        //var note = sheet.getRange(row, colReviewStatus).getNote();
        // test if email should be sent
        if (testEmailCase_(type, s, r, {
            sheet: sheet,
            row: row,
            column: colReviewStatus,
            days: days
          })) {
          // get email address
          var recipient = extractBracket(s['Reviewer' + r]);
          Logger.log(recipient);
          // shorten link for email
          
          var url = UrlShortener.Url.insert({
            longUrl: REVIEW_URL + '?action=review&token=' + createToken_(recipient, s.hashed_id, 'review', r, s.ID)
          });
          s.review_url = url.id;
          Logger.log(s.review_url);
          // build email
          var subject = fillInTemplateFromObject(email.subject, s);
          var body = fillInTemplateFromObject(email.text, s);
          try {
            GmailApp.sendEmail(recipient, subject, body, {
              bcc: 'systems@alt.ac.uk',
              replyTo: 'helpdesk@alt.ac.uk',
              name: 'ALT Helpdesk'
            });
            // record on sheet
            sheet.getRange(row, colReviewStatus).setValue('review_' + type)
              .setNote(capitalizeFirstLetter(type) + ' by: ' + Session.getActiveUser().getEmail() +
                '\nTo: ' + recipient +
                '\nURL: ' + s.review_url + 
                '\nDate: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm'));
          } catch (e) {
            sheet.getRange(row, colReviewStatus).setValue('error_' + type)
              .setNote('Error ' + type + ' by: ' +
                Session.getActiveUser().getEmail() + '\nDate: ' +
                Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm') +
                'Msg ' + e.message);
          }
          
        }
      }

    }
  });
}

/**
 * Private function to test if email should be sent
 * @param {string} type of email (review_assign || review_remind).
 * @param {Object} s submission data
 * @param {string} r review number (1-4).
 * @param {Object} reminder bunch of stuff.
 * @return {Boolean} if email should be sent.
 */
function testEmailCase_(type, s, r, reminder) {
  if (type === 'assigned') {
    if (s['Reviewer' + r] !== "" && s['Review' + r + ' Status'] === "") {
      return true;
    }
  } else if (type === 'reminded') {
    if (s['Review' + r + ' Status'] === 'review_assigned' || s['Review' + r + ' Status'] === 'review_reminded') {
      var note = reminder.sheet.getRange(reminder.row, reminder.column).getNote();
      var dateString = note.match(/\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}/);
      var note_date = (new Date().getTime() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24);
      if (note_date > reminder.days) {
        return true;
      }
    }
  } else if (type === 'accept') {
    if (s['Review' + r + ' Status'] === 'review_accept') {
      return true;
    }
  } else {
    return false
  }
  return false;
}



function buildReviewerLists() {
  var review_sheet = SpreadsheetApp.getActive().getSheetByName(REV_SHEET_NAME);
  //var reviewers = review_sheet.getDataRange();
  var reviewers = review_sheet.getRange("A1:G59");
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
  for (var r = 1; r < 5; r++) {
    revCols.push(headings.indexOf('Reviewer' + r));
  }

  // Reviewer Rules
  /*var nonHERevRule = reviewGroupRule(rev, 'Proposals from FE/Vocational/Adult Education');
  var researcherRule = reviewGroupRule(rev, 'Research papers (with route to journal publication)');
  var workshopRule = reviewGroupRule(rev, 'Interactive/workshop proposals');
  var shortPrezRule = reviewGroupRule(rev, 'Proposals for short presentations/lightning talks/posters');*/
  var allReviewers = reviewGroupRule(rev);
  

  // apply data validatation rules
  for (var i = 0; i < data.length; i++) {
    if (data[i][incCol] === 'yes') {
      applyRule(sheet, i + 2, revCols, allReviewers)
      /*if (data[i][secCol].indexOf('Higher Education') < 0) {
        // if Proposals from FE/Vocational/Adult Education
        applyRule(sheet, i + 2, revCols, nonHERevRule);
      } else if (data[i][typeCol].indexOf('Research session') > -1) {
        // else if Research papers (with route to journal publication)
        applyRule(sheet, i + 2, revCols, researcherRule);
      } else if (data[i][typeCol].indexOf('Discussion panel') > -1 || data[i][typeCol].indexOf('experimental session') > -1 || data[i][typeCol].indexOf('Workshop or demonstration') > -1) {
        // else if Interactive/workshop proposals
        applyRule(sheet, i + 2, revCols, workshopRule);
      } else {
        // else if Proposals for short presentations/lightning talks/posters
        applyRule(sheet, i + 2, revCols, shortPrezRule);
      }*/
    }
  }
}

function reviewGroupRule(rev, type) {
  var subgroup = rev.reduce(function(filtered, r) {
    if (type && r['Help shape the programme'].indexOf(type) !== -1) {
      filtered.push(r['Select String']);
    } else {
      filtered.push(r['Select String']);
    }
    return filtered
  }, []);
  return SpreadsheetApp.newDataValidation().requireValueInList(subgroup, true).build();
}

function applyRule(sheet, row, revCols, rule) {
  for (var r = 0; r < revCols.length; r++) {
    sheet.getRange(row, revCols[r] + 1).setDataValidation(rule);
  }
}
