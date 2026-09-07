const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Static file serving for the dashboard
const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
    fs.readFile(filePath, (err, content) => {
        if (err) { res.writeHead(404); res.end('Not found'); }
        else { res.writeHead(200); res.end(content); }
    });
});

const wss = new WebSocket.Server({ server });

let androidClients = {};
let webClient = null;
let activeAndroidCode = null;

function broadcastDeviceList() {
    if (webClient && webClient.readyState === WebSocket.OPEN) {
        const list = Object.keys(androidClients).map(code => ({
            code,
            name: androidClients[code].name,
            width: androidClients[code].width,
            height: androidClients[code].height
        }));
        webClient.send(JSON.stringify({ type: 'device_list', devices: list }));
    }
}

wss.on('connection', (ws) => {
    ws.on('message', (message, isBinary) => {
        if (isBinary) {
            if (ws.deviceCode && ws.deviceCode === activeAndroidCode && webClient) {
                webClient.send(message);
            }
        } else {
            const text = message.toString();
            try {
                const data = JSON.parse(text);
                if (data.type === 'android_init') {
                    ws.deviceCode = data.code;
                    androidClients[data.code] = {
                        ws: ws,
                        name: data.name,
                        width: data.width,
                        height: data.height
                    };
                    broadcastDeviceList();
                }
                else if (data.type === 'controller') {
                    webClient = ws;
                    broadcastDeviceList();
                }
                else if (data.type === 'select_device') {
                    activeAndroidCode = data.code;
                }
                else if (activeAndroidCode && androidClients[activeAndroidCode]) {
                    androidClients[activeAndroidCode].ws.send(text);
                }
            } catch (e) { }
        }
    });

    ws.on('close', () => {
        if (ws === webClient) webClient = null;
        if (ws.deviceCode) {
            delete androidClients[ws.deviceCode];
            if (activeAndroidCode === ws.deviceCode) activeAndroidCode = null;
            broadcastDeviceList();
        }
    });
});

// Use PORT from environment variable (required for Railway/Render)
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => console.log(`Server globally active on port ${PORT}`));
