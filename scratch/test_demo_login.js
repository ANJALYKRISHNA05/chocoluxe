const http = require('http');

async function makeRequest(path, method, data) {
    return new Promise((resolve, reject) => {
        const postData = data ? new URLSearchParams(data).toString() : '';
        const options = {
            hostname: 'localhost',
            port: 3003,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });

        req.on('error', (e) => reject(e));
        if (postData) req.write(postData);
        req.end();
    });
}

async function testDemoLogin() {
    try {
        console.log('Testing login for testing@gmail.com / testing123# ...');
        const res = await makeRequest('/user/login', 'POST', {
            email: 'testing@gmail.com',
            password: 'testing123#'
        });
        console.log('Response Status:', res.statusCode);
        console.log('Redirect Location:', res.headers.location);
        if (res.statusCode === 302 && res.headers.location === '/') {
            console.log('SUCCESS! testing@gmail.com logged in successfully!');
        } else {
            console.log('Login failed:', res.body);
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

testDemoLogin();
