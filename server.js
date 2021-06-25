const http = require("http");
const fs = require("fs");
const util = require("util");
const path = require('path');
const port = 3000;

const sendHeaders = (res, contentType, statusCode, kutas) => {
    console.log(contentType)
    if (contentType == "audio/mpeg") {
        res.writeHead(statusCode || 200, {
            'Content-Type': contentType,
            "Access-Control-Allow-Origin": "*",
            "Content-Length": kutas,
            "Accept-Ranges": "bytes"
        })
    }
    else {
        res.writeHead(statusCode || 200, {
            'Content-Type': contentType,
            "Access-Control-Allow-Origin": "*"

        })
    }
}

const readFile = util.promisify(fs.readFile)
const readDir = util.promisify(fs.readdir);

const secondPathComponent =
    req => decodeURIComponent(req.url)
        .split("/")
        .slice(2)
        .reduce((accum, next) => accum + "/" + next, "");

const baseFilesDir = path.join(__dirname, "static", "mp3");

const sendFileOfType = async (res, contentType, fileName) => {
    try {

        const fileContent = await readFile(fileName)
        const stats = fs.statSync(`${fileName}`)
        sendHeaders(res, contentType, 200, stats.size)

        res.end(fileContent);
    } catch (e) {
        console.error(e);
        res.writeHead(404)
        res.end();
    }
}

const getFileType = fileName => {
    const fileTypes = {
        '.jpg': 'image/jpg',
        '.mp3': 'audio/mpeg'
    }

    return Object.entries(fileTypes)
        .filter(([key, value]) => fileName.endsWith(key))
        .map(([key, value]) => value)[0] || '';
}

const sendSongOrCover = async (song, res) => {
    const fileName = path.join(baseFilesDir, song);
    const fileType = getFileType(fileName);

    await sendFileOfType(res, fileType, fileName);
}

const sendDirectoriesList = async (res, dirPath) => {
    sendHeaders(res, 'application/json');

    const subdirs = await readDir(dirPath);
    res.end(JSON.stringify(subdirs));
};

const listAlbumSongs = async (res, albumPath) => {
    const isMp3 = name => name.endsWith(".mp3");
    const filesNames = (await readDir(albumPath)).filter(isMp3);

    sendHeaders(res, 'application/json', 200);
    res.end(JSON.stringify(filesNames));
}

const preHandlers = [
    async (req, res) => {
        console.log(`${req.method} ${req.url}`);
    }
].map(handler => ({
    url: '',
    method: ['GET', 'POST', 'PATCH', 'PUT'],
    handler
}))

const handlers = [
    ...preHandlers,
    {
        url: '/lists',
        method: 'GET',
        handler: async (req, res) => {
            sendHeaders(res, 'application/json')
        }
    },
    {
        url: '/songs',
        method: 'GET',
        handler: async (req, res) => {
            const song = secondPathComponent(req)

            sendSongOrCover(song, res);
        }
    },
    {
        url: '/albums',
        method: 'GET',
        handler: async (req, res) => {
            const albumName = (secondPathComponent(req) || "").trim();
            const emptyAlbumName = !albumName || albumName == "" || albumName == "/";

            if (emptyAlbumName) {
                sendDirectoriesList(res, baseFilesDir);
            } else {
                const albumPath = path.join(baseFilesDir, albumName);
                listAlbumSongs(res, albumPath);
            }
        }
    }
];

const server = http.createServer(async (req, res) => {
    const decodedUrl = decodeURIComponent(req.url);

    const reactOnError = e => {
        res.writeHead(500);
        res.end(JSON.stringify({
            error: true,
            name: e.name,
            message: e.message,
            stack: e.stack
        }));

        console.error(e);
    }

    const matchesMethod = (req, handlerDesc) => {
        const matchSingleMethod = (req, method) => method.toUpperCase() == (req.method || "").toUpperCase();

        if (typeof handlerDesc.method == 'string') {
            return matchSingleMethod(req, handlerDesc.method);
        } else if (handlerDesc.method instanceof Array) {
            return handlerDesc.method.some(method => matchSingleMethod(req, method));
        } else {
            throw new Error("Unknown method type: " + handlerDesc.method);
        }
    }

    await handlers
        .filter(handlerDesc => decodedUrl.startsWith(handlerDesc.url))
        .filter(handlerDesc => matchesMethod(req, handlerDesc))
        .map(handlerDesc => handlerDesc.handler)
        .reduce(
            (promise, handler) => promise.then(() => handler(req, res).catch(reactOnError)),
            Promise.resolve()
        )
})

server.listen(port, () => {
    console.log("Serwer działa na porcie " + port);
})