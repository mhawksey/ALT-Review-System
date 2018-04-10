/**
 * Sets the reviewer status column for review_script.js.
 * @param {string} review_token for the review.
 * @param {string} reviewer_token for the review.
 * @param {string} reviewer_num for the review.
 * @param {string} type to be recorded (review_accept/review_decline).
 * @return {Object} response data.
 */
function setReviewerStatus(review_token, reviewer_token, reviewer_num, type) {
  updateReviewColumn_(review_token, reviewer_token, reviewer_num, type);
  return {
    result: 'ok',
    review_status: type
  }
}

/**
 * Private function to record data in the reviewer status column.
 * @param {string} review_token for the review.
 * @param {string} reviewer_token for the review.
 * @param {string} reviewer_num for the review.
 * @param {string} type to be recorded.
 * @return {string} returns reviewer string in 'name (email)' e.g. 'Martin Hawksey (martin.hawksey@alt.ac.uk)'.
 */
function updateReviewColumn_(review_token, reviewer_token, reviewer_num, type) {
  console.time('updateReviewColumn_');
  var d = checkForReviewerMismatch_(review_token, reviewer_token, reviewer_num);
  // loop through submissions and update review status
  for (var r = 0; r < d.dataValues.length; r++) {
    if (d.dataValues[r][d.dataValuesHeader.indexOf('Hashed ID')] === review_token) {
      d.sheet.getRange(r + 2, d.dataValuesHeader.indexOf('Review' + reviewer_num + ' Status') + 1)
        .setValue(type)
        .setNote(type + ' ' + d.reviewer + '\nDate: ' +
          Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm'));
      return d.reviewer;
    }
  }
  console.timeEnd('updateReviewColumn_');
  throw "Did not find review cell";
}

/**
 * Private function to check for reviewer mismatch
 * @param {string} review_token for the review.
 * @param {string} reviewer_token for the review.
 * @param {string} reviewer_num for the review.
 * @return {Object} returns bunch of stuff.
 */
function checkForReviewerMismatch_(review_token, reviewer_token, reviewer_num) {
  // fetch submission for review_token
  var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
  // Fetch the range of cells A:AN
  var dataRange = sheet.getRange("A:AN");
  var dataValues = dataRange.getValues();
  var dataValuesHeader = dataValues.shift();
  var subs = objectify(dataRange);
  // return filtered for review_token (should return single row)
  var sub = subs.filter(function(r) {
    if (r['Hashed ID'] === review_token) {
      return r
    }
  });

  // fetch reviewer for review_token
  var rev_sheet = SpreadsheetApp.getActive().getSheetByName(REV_SHEET_NAME);
  var dataRange = rev_sheet.getDataRange();
  var reviewers = objectify(dataRange);
  // return filtered for reviewer_token (should be single row)
  var reviewer = reviewers.filter(function(rev) {
    if (rev['ID'] === reviewer_token) {
      return rev
    }
  });
  // check the assigned reviewer matches reviewer submitting form
  var review_select = reviewer[0]['Select String'];
  var assigned_reviewer = sub[0]['Reviewer' + reviewer_num];
  if (review_select !== assigned_reviewer) {
    throw "Reviewer Mismatch";
  }
  sub[0].review_status = sub[0]['Review' + reviewer_num + ' Status']

  return {
    sheet: sheet,
    dataValues: dataValues,
    dataValuesHeader: dataValuesHeader,
    reviewer: reviewer[0]['Select String'],
    submission: sub[0]
  }
}

/**
 * Get the submission data for review_script.js
 * @param {string} review_token for the review.
 * @param {string} reviewer_token for the review.
 * @param {string} reviewer_num for the review.
 * @return {string} returns submission data.
 */
function getReviewData(review_token, reviewer_token, reviewer_num) {
  console.time('getReviewData');
  var d = checkForReviewerMismatch_(review_token, reviewer_token, reviewer_num);

  for (el in d.submission) {
    if (el.indexOf('Additional') > -1 || el.indexOf('Review') > -1) {
      delete d.submission[el];
    }
  }
  console.timeEnd('getReviewData')
  return JSON.stringify(d.submission);
}

/**
 * Get all the submission data for admin_script.js
 * @return {string} returns all submission data.
 */
function getAllSubmissionData() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
  // Fetch the range of cells A1:B3
  var dataRange = sheet.getDataRange();
  return JSON.stringify(objectify(dataRange));
}

/**
 * Set the review status for admin_script.js
 * @param {Number} row to update review status.
 * @param {string} value  to update (yes || no).
 * @return {string} returns submission data.
 */
function setReviewStatus(row, value) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SUB_SHEET_NAME);
  var headings = sheet.getDataRange()
    .offset(0, 0, 1)
    .getValues()[0];
  var column = headings.indexOf('Include') + 1;
  sheet.getRange(row, column).setValue(value)
  return el;
}

/**
 * Process the review form data for review_script.js
 * @param {Object} formData to be recorded.
 * @return {Object} returns result.
 */
function processReviewForm(formData) {
  console.time('processReviewForm')
  // https://stackoverflow.com/a/43238894
  // BEGIN - start lock here
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // wait 30 seconds for others' use of the code section and lock to stop and then proceed
  } catch (e) {
    return {
      result: 'error',
      message: 'Could not obtain lock'
    };
  }

  // note:  if return is run in the catch block above the following will not run as the function will be exited
  var sheet = SpreadsheetApp.getActive().getSheetByName(REVIEW_SHEET_NAME);
  var heads = sheet.getDataRange()
    .offset(0, 0, 1)
    .getValues()[0];
  sheet.insertRowAfter(1);
  formData.timestamp = new Date();

  var row = heads.map(function(cell) {
    if (Array.isArray(formData[cell])) {
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
    MailApp.sendEmail(recipient, subject, body, {
      cc: 'systems@alt.ac.uk',
      replyTo: 'helpdesk@alt.ac.uk'
    });
  } catch (e) {
    MailApp.sendEmail('martin.hawksey@alt.ac.uk', 'ALT Review System Error', JSON.stringify(formData, null, '\t'));
  }
  // END - end lock here
  console.timeEnd('processReviewForm');
  return {
    result: 'ok'
  };
}
