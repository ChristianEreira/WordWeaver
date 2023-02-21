dayjs.extend(window.dayjs_plugin_relativeTime);
dayjs.extend(window.dayjs_plugin_updateLocale);

dayjs.updateLocale('en', {
  relativeTime: {
    future: "in %s",
    past: "%s ago",
    s: '%d seconds',
    m: "1 minute",
    mm: "%d minutes",
    h: "1 hour",
    hh: "%d hours",
    d: "1 day",
    dd: "%d days",
    M: "a month",
    MM: "%d months",
    y: "a year",
    yy: "%d years"
  }
})

const BOARD_SIZE = 15;
const ZOOM_LEVEL = 3;
const ROUNDED_RADIUS = 6;
const BOARD_TILE_MARGIN = 120;
let tiles = [];
let tilePoints = {
    'E': 1, 'A': 1, 'R': 1, 'S': 1,
    'O': 2, 'T': 2, 'D': 2, 'I': 2,
    'N': 3, 'L': 3,
    'C': 4, 'U': 4,
    'P': 5,
    'M': 6, 'H': 6, 'B': 6,
    'G': 7, 'F': 7, 'Y': 7,
    'W': 8, 'K': 8, 'V': 8,
    'X': 9, 'Z': 9,
    'Q': 10, 'J': 10,
};
let c, ctx;
let dragTile;
let dragTileText = '';
let dragTilePoints = 0;
let rackElem;
let zoom = false;
let mousePos = { x: 0, y: 0 };
let draggedFrom = { x: 0, y: 0 };
let hoveredTile = null;
let currWords = [];

let db = firebase.firestore();

// Initialise board array
let board = [];
let prevBoard = [];
let realtimeBoard = [];
for (let i = 0; i < BOARD_SIZE; i++) {
    let row = [];
    let row2 = [];
    for (let j = 0; j < BOARD_SIZE; j++) {
        row.push(null);
        row2.push(null);
    }
    board.push(row);
    realtimeBoard.push(row2);
}

let urlParts = window.location.pathname.split("/");
let gameId = urlParts.pop();

let p1Info;
let p2Info;
let turn;
let gameData;
let currUser;
// Run after page loads
window.addEventListener('load', function () {
    document.querySelector("#signOutLink").onclick = e => {
        e.preventDefault();
        firebase.auth().signOut();
    }

    // Intro close button
    document.querySelector("#introCloseButton").addEventListener("mousedown", function () {
        document.querySelector("#introPopup").classList.add("hidden");
    });

    firebase.auth().onAuthStateChanged(async function (user) {
        if (user) {
            // User is signed in.
            document.querySelector('#details').textContent = user.displayName;
            document.querySelector('#image').src = user.photoURL || '../images/defaultUser.svg';

            // Get game info
            let gameDocRef = db.collection("readGames").doc(gameId);
            let gameDataRes = await gameDocRef.get();

            if (!gameDataRes.exists) {
                window.location.href = '/';
                return;
            }

            gameData = gameDataRes.data();

            let getUserInfo = firebase.functions().httpsCallable('getUserInfo');
            let getTileInfo = firebase.functions().httpsCallable('getTileInfo');
            let tileInfo = await getTileInfo(gameId);
            tiles = tileInfo.data;

            // Set user vars to correct users
            currUser = user.uid;
            if (gameData.p1 == user.uid) {
                p1Info = user;
                p2Info = (await getUserInfo(gameData.p2)).data;
            } else {
                p1Info = (await getUserInfo(gameData.p1)).data;
                p2Info = user;
            }

            // Listen for changes to the realtime board
            db.collection("writeGames").doc(gameId)
                .onSnapshot((doc) => {
                    let data = doc.data();
                    if (data) {
                        realtimeBoard = [];
                        for (let i = 0; i < 15; i++) {
                            realtimeBoard.push(data.tempBoard["row" + i].map((tile) => {
                                if (tile) {
                                    return { ...tile, color: "#d69a00" }
                                } else {
                                    return null;
                                }
                            }));
                        }
                    }
                });

            // Update score details
            document.querySelector('#p1Name').textContent = p1Info.displayName.split(' ')[0];
            document.querySelector('#p1Image').src = p1Info.photoURL || '../images/defaultUser.svg';
            document.querySelector('#p2Name').textContent = p2Info.displayName.split(' ')[0];
            document.querySelector('#p2Image').src = p2Info.photoURL || '../images/defaultUser.svg';
            document.querySelector('#p1Score').textContent = gameData.p1Score;
            document.querySelector('#p2Score').textContent = gameData.p2Score;
            console.log(gameData);
            for (let i = 0; i <= 15; i++) {
                prevBoard.push(gameData.board['row' + i]);
            }

            dragTile = document.querySelector(".tile.floating");

            // Make move button
            document.querySelector("#moveButton").addEventListener("mousedown", function () {
                document.querySelector("#moveButton").classList.add("disabled");
                document.querySelector("#endButton").classList.add("disabled");

                document.querySelector("#moveButtonText").textContent = "Loading...";
                let makeMove = firebase.functions().httpsCallable('makeMove');
                makeMove({ gameId: gameId, board: board }).then(res => {
                    console.log(res);
                    currWords = [];
                    document.querySelector("#moveButtonText").textContent = "Make move";
                });
            });

            // Surrender button
            document.querySelector("#endButton").addEventListener("mousedown", function () {
                document.querySelector("#endButton").textContent = "Loading...";
                let surrender = firebase.functions().httpsCallable('surrender');
                surrender({ gameId: gameId }).then(res => {
                    console.log(res);
                });
            });

            let moveHistoryPanel = document.querySelector("#moveHistory");

            gameDocRef.onSnapshot((doc) => {
                let data = doc.data();

                if ("winner" in data) {
                    console.log("Game over", data.winner, data.winReason);
                    let won = data.winner == currUser;
                    let message = "";
                    switch (data.winReason) {
                        case "surrender":
                            message = won ? "Your opponent surrendered!" : "You surrendered!";
                            break;
                        case "time":
                            message = won ? "Your opponent ran out of time!" : "You ran out of time!";
                            break;
                        case "points":
                            message = won ? "You reached 200 points!" : "Your opponent reached 200 points!";
                            break;
                        default:
                            message = won ? "Congratulations!" : "Better luck next time!";
                    }
                    document.querySelector("#endedPopup").innerHTML = `
                        <div class="gameCard ${won && "current"}">
                            <div class="cardCapsule ${won && "current"}">${won ? "You won!" : "You lost"}</div>
                            <p>${message}</p>
                            <div class="smallScores">
                                <div class="smallScoreLine">
                                    <img src="${p1Info.photoURL || '../images/defaultUser.svg'}" alt="">
                                    <p>${p1Info.displayName.split(' ')[0]}</p>
                                    <p>${data.p1Score}</p>
                                </div>
                                <div class="smallScoreLine">
                                    <img src="${p2Info.photoURL || '../images/defaultUser.svg'}" alt="">
                                    <p>${p2Info.displayName.split(' ')[0]}</p>
                                    <p>${data.p2Score}</p>
                                </div>
                            </div>
                            <a href="../"><div class="gameButton">Return to games list</div></a>
                        </div>`;
                    document.querySelector("#endedPopup").classList.remove("hidden");
                    document.querySelector("#endButton").textContent = "Surrender";
                    document.querySelector("#endButton").classList.add("disabled");

                } else {
                    getTileInfo(gameId).then(tileInfo => {
                        tiles = tileInfo.data;
                        updateTiles();
                        updateTurn(data.turn);
                    })
                }
                board = [];
                for (let i = 0; i < BOARD_SIZE; i++) {
                    let row = [];
                    for (let j = 0; j < BOARD_SIZE; j++) {
                        row.push(null);
                    }
                    board.push(row);
                }
                prevBoard = [];
                for (let i = 0; i <= 15; i++) {
                    prevBoard.push(data.board['row' + i]);
                }
                document.querySelector('#p1Score').textContent = data.p1Score;
                document.querySelector('#p2Score').textContent = data.p2Score;

                gameData.lastMoveTime = data.lastMoveTime;

                moveHistoryPanel.innerHTML = "";

                // Update moves panel
                data.moves.reverse();
                console.log(data.moves);
                data.moves.forEach(move => {
                    for (let i = 0; i < move.words.length; i++) {
                        let word = move.words[i];
                        moveHistoryPanel.innerHTML += `
                            <div>
                                <img class="${i !== 0 && "hidden"}" src="${move.player === p1Info.uid ? (p1Info.photoURL || '../images/defaultUser.svg') : (p2Info.photoURL || '../images/defaultUser.svg')}" alt="">
                                <p>${word.word}</p>
                                <p>${i !== move.words.length - 1 ? '<i class="fa-solid fa-arrow-turn-down"></i>' : move.score || "-"}</p>
                            </div>
                        `;
                    }
                });
            });

            updateTurn(gameData.turn);

            c = document.querySelector("#gameBoard");
            c.addEventListener("mousedown", boardMouseDown);
            ctx = c.getContext("2d");
            resizeBoard();
            draw();
            setTimeout(resizeBoard, 800);
            setInterval(() => {
                document.querySelector("#endTime").textContent = gameData.lastMoveTime ? dayjs(gameData.lastMoveTime.toDate()).add(1, 'day').fromNow(true) : "-";
            }, 1000);

            document.querySelector("#loadingPopup").classList.add('hidden');
        } else {
            // User is signed out.
            window.location = '../sign-in.html';
        }
    }, function (error) {
        console.log(error);
    });
});


/**
 * Updates the tiles in the tile rack
 */
function updateTiles() {
    // Place tiles in rack
    rackElem = document.querySelector("#tileRack");
    rackElem.innerHTML = '';
    for (let i = 0; i < tiles.length; i++) {
        let tile = tiles[i];
        let tileElem = document.createElement("div");
        tileElem.classList.add("tile");

        let letterElem = document.createElement("div");
        letterElem.appendChild(document.createTextNode(tile));
        tileElem.appendChild(letterElem);

        let numberElem = document.createElement("div");
        numberElem.classList.add("tileNumber");
        numberElem.appendChild(document.createTextNode(tilePoints[tile]));
        tileElem.appendChild(numberElem);

        tileElem.addEventListener("mousedown", tileMouseDown);
        rackElem.appendChild(tileElem);

        let spaceElem = document.createElement("div");
        spaceElem.classList.add("tileSpace");
        spaceElem.classList.add("disabled");
        rackElem.insertBefore(spaceElem, tileElem);
    }
    console.log("tiles updated");
}

/**
 * Updates UI depending on if it is the current user's turn
 * @param {string} newTurn - The id of the user who should now have a turn
 */
function updateTurn(newTurn) {
    document.querySelector('#moveButton').classList.add("disabled");

    turn = newTurn;
    if (turn == gameData.p1) {
        document.querySelector('#p1Image').classList.add("current");
        document.querySelector('#p2Image').classList.remove("current");
    } else {
        document.querySelector('#p2Image').classList.add("current");
        document.querySelector('#p1Image').classList.remove("current");
    }

    if (turn == currUser) {
        document.querySelector("#endButton").classList.remove("disabled");
        for (let elem of document.querySelectorAll('.tile')) {
            elem.classList.remove("disabled");
        }

        document.querySelector("#endText").textContent = "You will automatically surrender in: ";
    } else {
        document.querySelector("#endButton").classList.add("disabled");
        for (let elem of document.querySelectorAll('.tile')) {
            elem.classList.add("disabled");
        }

        document.querySelector("#endText").textContent = "Your opponent will automatically surrender in: ";
    }
}

/**
 * Draws the game board to the canvas
 * @param {boolean} [zoomed] - Should the board be drawn zoomed?
 */
function drawBoard(zoomed) {
    ctx.fillStyle = "#40a8c4";
    ctx.fillRect(-5, -5, c.offsetWidth + 10, c.offsetHeight + 10);

    let cellSize = (c.offsetWidth / BOARD_SIZE) - (c.offsetWidth / BOARD_TILE_MARGIN) - ((c.offsetWidth / BOARD_TILE_MARGIN) / BOARD_SIZE);
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            let x = i * cellSize + (i + 1) * (c.offsetWidth / BOARD_TILE_MARGIN);
            let y = j * cellSize + (j + 1) * (c.offsetWidth / BOARD_TILE_MARGIN);

            // Draw blank tiles
            drawTile(x, y, cellSize, { text: "", color: '#a2d5f2' }, zoomed);
            // Draw previous tiles
            drawTile(x, y, cellSize, prevBoard[i][j], zoomed, false);
            // Draw current tiles
            drawTile(x, y, cellSize, board[i][j], zoomed, true, prevBoard[i][j]?.modifier);
            // Draw realtime opponent tiles
            if (turn != currUser) {
                drawTile(x, y, cellSize, realtimeBoard[i][j], zoomed, false, prevBoard[i][j]?.modifier);
            }

            if (hoveredTile && hoveredTile.x == i && hoveredTile.y == j) {
                ctx.fillStyle = "#a2d5f2";
                drawRoundedSqaure(x, y, cellSize, true);
                ctx.strokeStyle = "#d69a00";
                ctx.lineWidth = cellSize / 8;
                ctx.stroke();
            }
        }
    }

    // Show valid/invalid words
    for (let word of currWords) {
        ctx.beginPath();
        ctx.arc((word.i + 1) * (cellSize + (c.offsetWidth / BOARD_TILE_MARGIN)), (word.j + 1) * (cellSize + (c.offsetWidth / BOARD_TILE_MARGIN)), cellSize / 4, 0, Math.PI * 2);
        if (word.valid) {
            ctx.fillStyle = "#00FF00";
        } else {
            ctx.fillStyle = "#FF0000";
        }
        ctx.fill();
        ctx.strokeStyle = "#d69a00"
        ctx.lineWidth = cellSize / 12;
        ctx.stroke();
    }
}

/**
 * A tile
 * @typedef {Object} tile
 * @property {string} text - The tile's letter
 * @property {string} color - The color of the tile
 * @property {string} [modifier] - The modifier applied to the tile
 */
/**
 * Draws a tile to a position on the canvas
 * @param {number} x - The x position on the canvas
 * @param {number} y - The y position on the canvas
 * @param {number} width - The width of the tile
 * @param {tile} tile - The tile to draw
 * @param {boolean} [zoomed] - Should the board be drawn zoomed?
 * @param {boolean} [current] - Has the tile been placed this turn?
 */
function drawTile(x, y, width, tile, zoomed, current, modifier) {
    let text;
    let points;
    let icon = false;
    if (tile != null) {
        let modifed = false;
        if ("modifier" in tile && !("text" in tile)) {
            if (tile.modifier == "start") {
                text = "\uF024";
                icon = true;
            } else {
                text = tile.modifier;
            }
            points = "";
            tile.color = "white";
        } else {
            text = tile.text;
            if ("modifier" in tile || modifier) {
                let mod = tile.modifier || modifier;
                if (mod != "start") {
                    modifed = true;
                }
                if (mod[0] === "x") {
                    points = tilePoints[tile.text] * parseInt(mod[1]);
                } else if (mod[0] === "+") {
                    points = tilePoints[tile.text] + parseInt(mod[1]);
                } else {
                    points = tilePoints[tile.text];
                }
            } else {
                points = tilePoints[tile.text];
            }
        }
        ctx.fillStyle = tile.color;
        drawRoundedSqaure(x, y, width);
        // Add outline to current tiles
        if (current) {
            ctx.strokeStyle = "#d69a00";
            ctx.lineWidth = width / 8;
            ctx.stroke();
        }
        ctx.fillStyle = modifed ? "#9900CC" : "#000000";

        // Draw tile and score text
        ctx.textBaseline = "top";
        ctx.textAlign = "right";
        if (zoomed) {
            ctx.font = "700 " + width / 3.9 + (icon ? "px 'Font Awesome 5 Free'" : "px Noto Sans");
            ctx.fillText(points || "", x + (width * (8 / 9)), y + (width / 9));
        } else {
            ctx.font = "700 " + width / 2.8 + (icon ? "px 'Font Awesome 5 Free'" : "px Noto Sans");
            ctx.fillText(points || "", x + (width * (8 / 9)), y + (width * (0.5 / 9)));
        }
        ctx.fillStyle = "#000000";
        ctx.font = "700 " + width / 2 + (icon ? "px 'Font Awesome 5 Free'" : "px Noto Sans");
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x + (width / 2) - (ctx.measureText(text).width / 2), "modifier" in tile && !("text" in tile) ? y + (width / 2) : y + (width * (6 / 10)));
    }
}

/**
 * Draw a rounded square to the canvas
 * @param {number} x - The x position on the canvas
 * @param {number} y - The y position on the canvas
 * @param {number} width - The width of the square
 * @param {boolean} [noFill] - Should the square be filled?
 */
function drawRoundedSqaure(x, y, width, noFill) {
    let r = width / ROUNDED_RADIUS;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.arcTo(x + width, y, x + width, y + r, r)
    ctx.lineTo(x + width, y + width - r);
    ctx.arcTo(x + width, y + width, x + width - r, y + width, r);
    ctx.lineTo(x + r, y + width);
    ctx.arcTo(x, y + width, x, y + width - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);

    if (!noFill) {
        ctx.fill();
    }
}

/**
 * The draw event - called automatically
 */
function draw() {
    ctx.strokeStyle = "#a2d5f2";

    drawBoard();

    // If should be zoomed, mask a circle and draw again zooomed
    if (zoom) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = "#000000";
        ctx.arc(mousePos.x - c.offsetLeft, mousePos.y - c.offsetTop, c.width / 2.5, 0, Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.clip();

        ctx.translate(-(c.width * (ZOOM_LEVEL - 1)) * ((mousePos.x - c.offsetLeft) / c.offsetWidth), -(c.height * (ZOOM_LEVEL - 1)) * ((mousePos.y - c.offsetTop) / c.offsetHeight));
        ctx.scale(ZOOM_LEVEL, ZOOM_LEVEL);
        drawBoard(true);

        ctx.restore();
    }

    window.requestAnimationFrame(draw);
}

/**
 * Sets board dimensions - called when screen size changes
 */
function resizeBoard() {
    c.height = 1;
    c.style.width = c.offsetHeight + "px";
    c.width = c.offsetHeight;
    c.height = c.offsetHeight;
}

function boardMouseDown(e) {
    e.preventDefault();

    // Get tile number from mouse position
    let i = Math.floor((e.clientX - c.offsetLeft - (c.offsetWidth / BOARD_TILE_MARGIN) / 2) * (15 / (c.offsetWidth - (c.offsetWidth / BOARD_TILE_MARGIN))));
    let j = Math.floor((e.clientY - c.offsetTop - (c.offsetWidth / BOARD_TILE_MARGIN) / 2) * (15 / (c.offsetHeight - (c.offsetWidth / BOARD_TILE_MARGIN))));

    if (i >= 0 && i < 15 && j >= 0 && j < 15) {
        // If clicked on tile...
        if (board[i][j]) {
            draggedFrom.x = i;
            draggedFrom.y = j;

            // Create drag tile
            // HERE
            dragTileText = board[i][j].text;
            dragTilePoints = tilePoints[board[i][j].text];
            dragTile.innerHTML = "";
            let letterElem = document.createElement("div");
            letterElem.appendChild(document.createTextNode(dragTileText));
            dragTile.appendChild(letterElem);

            let numberElem = document.createElement("div");
            numberElem.classList.add("tileNumber");
            numberElem.appendChild(document.createTextNode(dragTilePoints));
            dragTile.appendChild(numberElem);
            dragTile.classList.remove("hidden");
            dragTile.style.top = e.clientY - (dragTile.offsetHeight / 2) + "px";
            dragTile.style.left = e.clientX - (dragTile.offsetWidth / 2) + "px";

            board[i][j] = null;
            testWords();

            mousePos.x = e.clientX;
            mousePos.y = e.clientY;

            zoom = true;

            document.addEventListener("mousemove", tileMouseMove);
            document.addEventListener("mouseup", boardMouseUp);
        }
    }
}

function commonMouseUp(e) {
    hoveredTile = null;

    dragTile.classList.add("hidden");
    zoom = false;

    let added = false;
    let tileElems = rackElem.children;
    // For each tile in rack...
    for (let elem of tileElems) {
        if (elem.classList.contains("tileSpace")) {
            // If mouse if over tile space...
            if (e.clientX >= elem.offsetLeft - (elem.offsetWidth + 16) && e.clientX <= elem.offsetLeft + (elem.offsetWidth + 16) * 1.5
                && e.clientY >= elem.offsetTop - 16 && e.clientY <= elem.offsetTop + elem.offsetHeight + 16) {
                // Create new tile and space elem
                let tileElem = document.createElement("div");
                tileElem.classList.add("tile");
                let letterElem = document.createElement("div");
                letterElem.appendChild(document.createTextNode(dragTileText));
                tileElem.appendChild(letterElem);

                let numberElem = document.createElement("div");
                numberElem.classList.add("tileNumber");
                numberElem.appendChild(document.createTextNode(dragTilePoints));
                tileElem.appendChild(numberElem);

                tileElem.addEventListener("mousedown", tileMouseDown);
                rackElem.insertBefore(tileElem, elem);
                let spaceElem = document.createElement("div");
                spaceElem.classList.add("tileSpace");
                spaceElem.classList.add("disabled");
                rackElem.insertBefore(spaceElem, tileElem);
                added = true;

                document.querySelector('#moveButton').classList.add("disabled");
                document.querySelector("#moveButtonText").textContent = "Make move";
                break;
            }
        }
    }

    // Disable all tile spaces
    for (let elem of tileElems) {
        if (elem.classList.contains("tileSpace")) {
            elem.classList.add("static");
            elem.classList.add("disabled");
            elem.offsetHeight;
            elem.classList.remove("static");
        }
    }

    // Get tile number from mouse position
    let i = Math.floor((e.clientX - c.offsetLeft - (c.offsetWidth / BOARD_TILE_MARGIN) / 2) * (15 / (c.offsetWidth - (c.offsetWidth / BOARD_TILE_MARGIN))));
    let j = Math.floor((e.clientY - c.offsetTop - (c.offsetWidth / BOARD_TILE_MARGIN) / 2) * (15 / (c.offsetHeight - (c.offsetWidth / BOARD_TILE_MARGIN))));

    // Add tile to board
    if (i >= 0 && i < 15 && j >= 0 && j < 15 && !board[i][j] && (prevBoard[i][j] == null || !("text" in prevBoard[i][j]))) {
        board[i][j] = { text: dragTileText, points: dragTilePoints, color: "#ffc93c" };
        testWords();
        added = true;
    }

    return added;
}

function boardMouseUp(e) {
    document.removeEventListener("mousemove", tileMouseMove);
    document.removeEventListener("mouseup", boardMouseUp);

    // If tile wasn't moved, place it back on board
    if (!commonMouseUp(e)) {
        document.querySelector('#moveButton').classList.add("disabled");
        document.querySelector("#moveButtonText").textContent = "Make move";
        board[draggedFrom.x][draggedFrom.y] = { text: dragTileText, color: "#ffc93c" };
    }
}

function tileMouseDown(e) {
    e.preventDefault();

    let sourceElem = e.srcElement;
    if (!e.srcElement.classList.contains("tile")) {
        sourceElem = e.srcElement.parentElement;
    }

    if (turn == currUser && sourceElem.classList.contains("tile")) {
        // Create drag tile
        dragTileText = sourceElem.children[0].textContent;
        dragTilePoints = sourceElem.children[1].textContent;
        dragTile.innerHTML = "";
        let letterElem = document.createElement("div");
        letterElem.appendChild(document.createTextNode(dragTileText));
        dragTile.appendChild(letterElem);

        let numberElem = document.createElement("div");
        numberElem.classList.add("tileNumber");
        numberElem.appendChild(document.createTextNode(dragTilePoints));
        dragTile.appendChild(numberElem);

        dragTile.classList.remove("hidden");
        dragTile.style.top = e.clientY - (dragTile.offsetHeight / 2) + "px";
        dragTile.style.left = e.clientX - (dragTile.offsetWidth / 2) + "px";

        // Enable tile space
        if (sourceElem.nextSibling) {
            sourceElem.nextSibling.classList.add("static");
            sourceElem.nextSibling.classList.remove("disabled");
            sourceElem.nextSibling.offsetHeight;
            sourceElem.nextSibling.classList.remove("static");
        }
        rackElem.removeChild(sourceElem.previousSibling);
        rackElem.removeChild(sourceElem);

        mousePos.x = e.clientX;
        mousePos.y = e.clientY;

        document.addEventListener("mousemove", tileMouseMove);
        document.addEventListener("mouseup", tileMouseUp);
    }
}

function tileMouseMove(e) {
    // Move drag tile
    dragTile.style.top = e.clientY - (dragTile.offsetHeight / 2) + "px";
    dragTile.style.left = e.clientX - (dragTile.offsetWidth / 2) + "px";

    let tileElems = rackElem.children;
    // For each tile in rack...
    for (let elem of tileElems) {
        if (elem.classList.contains("tile")) {
            // Enable tile space
            if (e.clientX >= elem.offsetLeft - (elem.offsetWidth + 16) / 2 && e.clientX <= elem.offsetLeft + (elem.offsetWidth + 16) / 2
                && e.clientY >= elem.offsetTop - 16 && e.clientY <= elem.offsetTop + elem.offsetHeight + 16) {
                elem.previousSibling.classList.remove("disabled");
            }
        } else {
            // Disable tile space
            if (!(e.clientX >= elem.offsetLeft - (elem.offsetWidth + 16) && e.clientX <= elem.offsetLeft + (elem.offsetWidth + 16) * 1.5
                && e.clientY >= elem.offsetTop - 16 && e.clientY <= elem.offsetTop + elem.offsetHeight + 16)) {
                elem.classList.add("disabled");
            }
        }
    }

    if (e.clientX >= c.offsetLeft && e.clientX <= c.offsetLeft + c.offsetWidth
        && e.clientY >= c.offsetTop && e.clientY <= c.offsetTop + c.offsetHeight) {
        zoom = true;
    } else {
        zoom = false;
    }

    mousePos.x = e.clientX;
    mousePos.y = e.clientY;

    // Get tile number from mouse position
    let i = Math.floor((e.clientX - c.offsetLeft - (c.offsetWidth / BOARD_TILE_MARGIN) / 2) * (15 / (c.offsetWidth - (c.offsetWidth / BOARD_TILE_MARGIN))));
    let j = Math.floor((e.clientY - c.offsetTop - (c.offsetWidth / BOARD_TILE_MARGIN) / 2) * (15 / (c.offsetHeight - (c.offsetWidth / BOARD_TILE_MARGIN))));

    if (i >= 0 && i < 15 && j >= 0 && j < 15 && !board[i][j] && (prevBoard[i][j] == null || !("text" in prevBoard[i][j]))) {
        hoveredTile = { x: i, y: j };
    } else {
        hoveredTile = null;
    }
}

function tileMouseUp(e) {
    dragTile.classList.add("hidden");
    document.removeEventListener("mousemove", tileMouseMove);
    document.removeEventListener("mouseup", tileMouseUp);

    // If tile wasn't added...
    if (!commonMouseUp(e)) {
        // Add back into rack
        let tileElem = document.createElement("div");
        tileElem.classList.add("tile");
        let letterElem = document.createElement("div");
        letterElem.appendChild(document.createTextNode(dragTileText));
        tileElem.appendChild(letterElem);

        let numberElem = document.createElement("div");
        numberElem.classList.add("tileNumber");
        numberElem.appendChild(document.createTextNode(dragTilePoints));
        tileElem.appendChild(numberElem);
        tileElem.addEventListener("mousedown", tileMouseDown);
        rackElem.appendChild(tileElem);
        let spaceElem = document.createElement("div");
        spaceElem.classList.add("tileSpace");
        spaceElem.classList.add("disabled");
        rackElem.insertBefore(spaceElem, tileElem);
    }
}

/**
 * Return a list of current valid words placed on the board
 * Updates realtime board
 */
async function testWords() {
    document.querySelector('#moveError').classList.add("hidden");
    document.querySelector('#moveButton').classList.add("disabled");
    document.querySelector("#moveButtonText").textContent = "Checking...";
    let toUpdate = {};
    for (let i = 0; i < 15; i++) {
        let row = [];
        for (let j = 0; j < 15; j++) {
            row.push(board[i][j]);
        }
        toUpdate["row" + i] = row;
    }
    db.collection("writeGames").doc(gameId).update({ tempBoard: toUpdate });
    // db.collection("games").doc(gameId).update({ turn: turn == gameData.p1 ? gameData.p2 : gameData.p1 });

    currWords = [];

    // firebase.functions().useFunctionsEmulator("http://localhost:5001");
    let validateWords = firebase.functions().httpsCallable('validateWords');
    let result = await validateWords({ board: board, gameId: gameId });
    console.log(result.data);
    if (JSON.stringify(result.data.board) == JSON.stringify(board)) {
        currWords = result.data.words;

        if (currWords.map(w => w.valid).includes(false) || currWords.length == 0 || result.data.score == 0) {
            document.querySelector('#moveButton').classList.add("disabled");
            document.querySelector("#moveButtonText").textContent = "Make move";
        } else {
            document.querySelector('#moveButton').classList.remove("disabled");
            document.querySelector("#moveButtonText").textContent = "Make move (" + result.data.score + ")";
        }
    } else {
        document.querySelector('#moveButton').classList.add("disabled");
        document.querySelector("#moveButtonText").textContent = "Make move";

        if ("error" in result.data) {
            document.querySelector('#moveError').classList.remove("hidden");
            document.querySelector("#moveError").textContent = result.data.error;
        }
    };

    // Check for words that end on the same tile
    if (currWords.length == 2) {
        if ((currWords[0].i == currWords[1].i && currWords[0].j == currWords[1].j) && (!currWords[0].valid || !currWords[1].valid)) {
            currWords[0].valid = false;
            currWords[1].valid = false;
        }
    }
}

window.addEventListener('resize', resizeBoard);