const {stringify} = require('querystring');
const google = require('googleapis');
const co = require('co');
const _url = require("url");
const fetch = require('node-fetch');
// eslint-disable-next-line import/no-extraneous-dependencies
const {BrowserWindow} = require('electron');

const OAuth2 = google.auth.OAuth2;

/* eslint-disable camelcase */

function getAuthenticationUrl(scopes, clientId, clientSecret, redirectUri = 'urn:ietf:wg:oauth:2.0:oob') {
	const oauth2Client = new OAuth2(
		clientId,
		clientSecret,
		redirectUri
	);
	const url = oauth2Client.generateAuthUrl({
		access_type: 'offline', // 'online' (default) or 'offline' (gets refresh_token)
		scope: scopes // If you only need one scope you can pass it as string
	});
	return url;
}

function authorizeApp(url, browserWindowParams, httpAgent, pageTitleSuccess, forceLogin) {
	return new Promise((resolve, reject) => {
		const win = new BrowserWindow(browserWindowParams || {'use-content-size': true});
		if(forceLogin){
			console.log('Force login')
			win.webContents.session.clearStorageData(['cookies'], function (data) {
				console.log(data);
			})
		}
		win.loadURL(url, {userAgent: httpAgent});

		win.on('closed', () => {
			reject(new Error('User closed the window'));
		});

		win.webContents.on('did-navigate', (_event, newUrl) => {
			console.dir(newUrl);
			const parsed = _url.parse(newUrl, true);
			if (parsed.query.error) {
				reject(new Error(parsed.query.error_description));
				win.close();
			}
			else if (parsed.query.code) {
				resolve(parsed.query.code);
				win.close();
			}
		});

		win.on('page-title-updated', () => {
			setImmediate(() => {
				const title = win.getTitle();
				if (title.startsWith('Denied')) {
					reject(new Error(title.split(/[ =]/)[2]));
					win.removeAllListeners('closed');
					win.close();
				} else if (title.startsWith(pageTitleSuccess)) {
					resolve(title.split(/[ =]/)[2]);
					win.removeAllListeners('closed');
					win.close();
				}
			});
		});
	});
}

module.exports = function electronGoogleOauth(browserWindowParams, httpAgent, pageTitleSuccess, forceLogin) {
	function getAuthorizationCode(scopes, clientId, clientSecret, redirectUri = 'urn:ietf:wg:oauth:2.0:oob') {
		const url = getAuthenticationUrl(scopes, clientId, clientSecret, redirectUri);
		return authorizeApp(url, browserWindowParams, httpAgent, pageTitleSuccess, forceLogin);
	}

	const getAccessToken = co.wrap(function * (scopes, clientId, clientSecret, redirectUri = 'urn:ietf:wg:oauth:2.0:oob') {
		const authorizationCode = yield getAuthorizationCode(scopes, clientId, clientSecret, redirectUri);

		const data = stringify({
			code: authorizationCode,
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: 'authorization_code',
			redirect_uri: redirectUri,
			response_type : 'code'
		});

		const res = yield fetch('https://www.googleapis.com/oauth2/v4/token', {
			method: 'post',
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: data,
			agent: httpAgent
		});
		return yield res.json();
	});

	return {getAuthorizationCode, getAccessToken};
};
