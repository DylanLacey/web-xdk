/*eslint-disable */
module.exports = function(grunt, version) {
  var result = {
    tasks: {}
  };

  // Specifying a specific browser:
// grunt test --browsers=chrome-1,edge-0

// Naming pattern:
// * -0: Latest
// * -1: Latest - 1 version
// ** Number: A hardcoded version number
var supportedBrowsers = {
  // 'ie11': {
  //   browserName: 'internet explorer',
  //   platform: 'Windows 8.1',
  //   version: '11.0'
  // },
  'edge-1': {
    browserName: 'MicrosoftEdge',
     'platform': 'Windows 10',
     version: '13.10586'
  },
  'edge-0': {
     browserName: 'MicrosoftEdge',
     'platform': 'Windows 10',
     version: 'latest'
  }
 //  'safari-1': {
 //    browserName: 'safari',
 //    version: '10.0'
 //  },
 //  'safari-0': {
 //    browserName: 'safari',
 //    version: 'latest'
 //  },
 // 'ios-1': {
 //    browserName: 'iphone',
 //    version: '10.0'
 //  },
 //  'ios-0': {
 //    browserName: 'iphone',
 //    version: 'latest',
 //  },
 //  'chrome-1': {
 //    browserName: 'chrome',
 //    platform: 'OSX 10.9',
 //    version: 'latest-1'
 //  },
 //  'chrome-0': {
 //    browserName: 'chrome',
 //    platform: 'WIN8',
 //    version: 'latest'
 //  },
 //  'firefox-1': {
 //    browserName: 'firefox',
 //    version: 'latest-1',
 //    platform: 'WIN8'
 //  },
  // 'firefox-0': {
  //   browserName: 'firefox',
  //   version: 'latest',
  //   'platform': 'Windows 10'
  // }
};


// These do not support websockets, so are not supported by layer-websdk
var unsupportedBrowsers = {
  'safari8': {
    browserName: 'safari',
    version: '8.0',
    platform: 'OS X 10.10'
  },
  'ios-2': {
    browserName: 'iphone',
    version: 'latest-2',
    platform: 'OS X 10.9'
  },
};

  var browsers;
  var ipaddress = "localhost";
  if (grunt.option('browsers')) {
    browsers = grunt.option('browsers').split(/\s*,\s*/).map(function(name) {
      if (supportedBrowsers[name]) return supportedBrowsers[name];
      if (unsupportedBrowsers[name]) return unsupportedBrowsers[name];
      throw new Error(name + ' not found');
    });
  } else  {
    browsers = Object.keys(supportedBrowsers).map(function(key) {return supportedBrowsers[key]});
  }

  var quickTestUrls = [
    "http://localhost:9999/test/ui_tests.html?stop=true",
    "http://localhost:9999/test/core_tests.html?stop=true"
  ];
  var quickTestBrowsers = [
    // supportedBrowsers['safari-1'],
    // supportedBrowsers['safari-0'],
    supportedBrowsers['edge-0'],
    supportedBrowsers['edge-1']
    // supportedBrowsers['ie11'],
    // supportedBrowsers['chrome-1'],
    // supportedBrowsers['chrome-0'],
    //supportedBrowsers['firefox-1'], enable once firefox-1 becomes Firefox 58; 57 has problems
    // supportedBrowsers['firefox-0']
  ];

  var smallTestUrls = grunt.file.expand("test/smalltest*.html").map(file => "http://localhost:9999/" + file + "?stop=true");


  var smallTestBrowsers = [
    supportedBrowsers['ios-0'],
    supportedBrowsers['ios-1']
  ];

  var totalRuns = smallTestUrls.length * smallTestBrowsers.length + quickTestBrowsers.length * quickTestUrls.length;
  var currentRuns = 0;

  function onTestComplete(result, callback) {
    currentRuns++;
    var testPage = result.testPageUrl.replace(/^.*\//, '').replace(/\?.*$/, '');
    console.log("----------------------------------------\nSaucelabs Results for " + testPage + ":" + result.passed);
    console.log("Completed: " + currentRuns + " of " + totalRuns);
    require("request").put({
      url: ['https://saucelabs.com/rest/v1', process.env.SAUCE_USERNAME, 'jobs', result.job_id].join('/'),
      auth: { user: process.env.SAUCE_USERNAME, pass: process.env.SAUCE_ACCESS_KEY },
      json: {
        passed: Boolean(result.passed),
        name: currentRuns + "/" + totalRuns + ": " + (!result.result || !result.result.errors ? " Failed to Complete" : " Completed") + " Layer Web XDK " + version + " " + testPage,
      }
    }, function (error, response, body) {
      if (response.statusCode != 200) {
        console.error("Error updating sauce results: " + body.error  + '/' + response.statusCode);
      }
    });

    if (result.passed) {
      callback();
    } else if (!result.result || !result.result.errors) {
      console.error("Unexpected result passed from server");
      console.error(JSON.stringify(result, null, 4));
      callback(false);
    } else {
      console.error("Unit Test Errors for " + result.platform.join(', ') + "\n •", result.result.errors.join("\n • "));
      callback(false);
    }
  }

  result.tasks.saucelabs = {
    quicktests: {
      options: {
        browsers: quickTestBrowsers,
        urls: quickTestUrls
      }
    },
    smalltests: {
      options: {
        browsers: smallTestBrowsers,
        urls: smallTestUrls
      }
    },
    options: {
      tunnelArgs: ["-B all"],
      tunneled: true,
      browsers: browsers,
      build: "Layer Web XDK <%= pkg.version %>" + (process.env.TRAVIS_JOB_NUMBER ? ' ' + process.env.TRAVIS_JOB_NUMBER : ''),

      concurrency: 2,
      throttled: 2,
      testname: "Running Layer Web XDK <%= pkg.version %> Unit Test",
      tags: ["master", 'Unit Test', 'Web'],

      // WARNING: If tests are timing out, adjust these values; they are documented in grunt-saucelabs README.md
      pollInterval: 2000, // Check for test results every 5 seconds (miliseconds)
      statusCheckAttempts: 5000,
      "max-duration": 10000,
      maxRetries: 10,
      onTestComplete: onTestComplete
    }
  };

  return result;
};
