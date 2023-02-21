const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const fetch = require("node-fetch");
let db = admin.firestore();

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

/**
 * A board object
 * @typedef {Object} boardData
 * @property {Array} board - An array of tiles that make up the new board
 * @property {number} boardsize - The width of the board in tiles
 * @property {Array} prevboard - An array of tiles that make up the previous board
 */

/**
 * Ends a game
 * @param {string} gameId - The ID of the game to end
 * @param {string} winner - The ID of the winning player
 * @param {string} winReason - The reason the game was won
 */
async function endGame(gameId, winner, winReason) {
    await db.collection("hiddenGames").doc(gameId).delete();
    await db.collection("writeGames").doc(gameId).delete();
    await db.collection("readGames").doc(gameId).update({ winner: winner, turn: null, winTime: admin.firestore.Timestamp.fromDate(new Date()), winReason: winReason });
}

/**
 * Finds a list of words from the board and labels their determined validity
 * @param {boardData} data - The board data
 * @returns {Object} - An object containing the words found and the new board
 */
async function findWords(data, gameData) {
    // Check if all new tiles form a line (with previous tiles)
    // Loop through new tiles, check horizonal of tile to see if any other tiles.
    // if so, keep going until found word (need to handle if both sides (go left until no tile, then read right until no tile)).
    // Add word to a list and mark tile as horizontally checked
    // Do the same with vertical
    // Continue loop, don't re-check if tile is already checked on that axis
    // Send words in list to API for validation

    let board = data.board;

    let prevBoard = [];
    for (let i = 0; i <= 15; i++) {
        prevBoard.push(gameData.board['row' + i]);
    }

    let placedTiles = [];
    for (let i = 0; i < 15; i++) {
        for (let j = 0; j < 15; j++) {
            if (board[i][j]) {
                placedTiles.push({ i: i, j: j, tile: board[i][j].text });
            }
        }
    }

    if (placedTiles.length == 0) {
        return { error: "No tiles have been placed" };
    } else if (placedTiles.length > 0) {
        let startTile = false;
        let commonI = true;
        let commonJ = true;
        for (let i = 0; i < placedTiles.length; i++) {
            if (placedTiles[i].i !== placedTiles[0].i) {
                commonI = false;
            }
            if (placedTiles[i].j !== placedTiles[0].j) {
                commonJ = false;
            }
            if (placedTiles[i].i == 7 && placedTiles[i].j == 7) {
                startTile = true;
            }
            if (prevBoard[placedTiles[i].i][placedTiles[i].j] !== null && "text" in prevBoard[placedTiles[i].i][placedTiles[i].j]) {
                return { error: "A placed tile collides with an existing one" };
            }
        }

        if (gameData.moves.length == 0 && !startTile) {
            return { error: "The first word must be over the start tile" };
        }

        if (commonI) {
            for (let j = placedTiles[0].j; j < placedTiles[placedTiles.length - 1].j; j++) {
                if (!(board[placedTiles[0].i][j] || prevBoard[placedTiles[0].i][j])) {
                    return { error: "Tiles can only be placed in a line" };
                }
            }
        } else if (commonJ) {
            for (let i = placedTiles[0].i; i < placedTiles[placedTiles.length - 1].i; i++) {
                if (!(board[i][placedTiles[0].j] || prevBoard[i][placedTiles[0].j])) {
                    return { error: "Tiles can only be placed in a line" };
                }
            }
        } else {
            return { error: "Tiles can only be placed in a line" };
        }

        if (gameData.moves.length !== 0) {
            // Check if any tiles are touching existing tiles
            let touching = false;
            for (let i = 0; i < placedTiles.length; i++) {
                if (placedTiles[i].i > 0 && prevBoard[placedTiles[i].i - 1][placedTiles[i].j] !== null && "text" in prevBoard[placedTiles[i].i - 1][placedTiles[i].j]) {
                    touching = true;
                } else if (placedTiles[i].i < 14 && prevBoard[placedTiles[i].i + 1][placedTiles[i].j] !== null && "text" in prevBoard[placedTiles[i].i + 1][placedTiles[i].j]) {
                    touching = true;
                } else if (placedTiles[i].j > 0 && prevBoard[placedTiles[i].i][placedTiles[i].j - 1] !== null && "text" in prevBoard[placedTiles[i].i][placedTiles[i].j - 1]) {
                    touching = true;
                } else if (placedTiles[i].j < 14 && prevBoard[placedTiles[i].i][placedTiles[i].j + 1] !== null && "text" in prevBoard[placedTiles[i].i][placedTiles[i].j + 1]) {
                    touching = true;
                }
            }
            if (!touching) {
                return { error: "Tiles must be placed next to existing tiles" };
            }
        }
    }
    // 1 tile or valid line
    let checked = [];
    for (let i = 0; i < 15; i++) {
        let row = [];
        for (let j = 0; j < 15; j++) {
            row.push({ hor: false, vert: false });
        }
        checked.push(row);
    }

    let words = [];
    let score = 0;
    for (let i = 0; i < placedTiles.length; i++) {
        if (!checked[placedTiles[i].i][placedTiles[i].j].hor) {
            // Check horizontal
            let first = placedTiles[i].i;
            while (first >= 0 && (board[first][placedTiles[i].j] || (prevBoard[first][placedTiles[i].j] !== null && "text" in prevBoard[first][placedTiles[i].j]))) {
                first--;
            }
            first++;
            let word = "";
            let wordScore = 0;
            let curr = first;
            while (curr < 15 && (board[curr][placedTiles[i].j] || (prevBoard[curr][placedTiles[i].j] !== null && "text" in prevBoard[curr][placedTiles[i].j]))) {
                let tile = board[curr][placedTiles[i].j] || prevBoard[curr][placedTiles[i].j];
                let tileScore = tilePoints[tile.text];
                word += tile.text;
                if (prevBoard[curr][placedTiles[i].j] !== null && "modifier" in prevBoard[curr][placedTiles[i].j]) {
                    switch (prevBoard[curr][placedTiles[i].j].modifier[0]) {
                        case "x":
                            wordScore += tileScore * parseInt(prevBoard[curr][placedTiles[i].j].modifier[1]);
                            functions.logger.info(tile.text + (tileScore * parseInt(prevBoard[curr][placedTiles[i].j].modifier[1])) + "(" + tileScore + "*" + prevBoard[curr][placedTiles[i].j].modifier[1] + ")");
                            break;
                        case "+":
                            wordScore += tileScore + parseInt(prevBoard[curr][placedTiles[i].j].modifier[1]);
                            functions.logger.info(tile.text + (tileScore + parseInt(prevBoard[curr][placedTiles[i].j].modifier[1])) + "(" + tileScore + "+" + prevBoard[curr][placedTiles[i].j].modifier[1] + ")");
                            break;
                        default:
                            wordScore += tileScore;
                            functions.logger.info("didn't match: " + prevBoard[curr][placedTiles[i].j].modifier[0]);
                    }
                } else {
                    wordScore += tileScore;
                    functions.logger.info(tile.text + tileScore);
                }
                checked[curr][placedTiles[i].j].hor = true;
                curr++;
            }
            if (word.length > 1) {
                words.push({ word: word, i: --curr, j: placedTiles[i].j, valid: false });
                score += wordScore;
            }
        }
        if (!checked[placedTiles[i].i][placedTiles[i].j].vert) {
            // Check vertical
            let first = placedTiles[i].j;
            while (first >= 0 && (board[placedTiles[i].i][first] || (prevBoard[placedTiles[i].i][first] !== null && "text" in prevBoard[placedTiles[i].i][first]))) {
                first--;
            }
            first++;
            let word = "";
            let wordScore = 0;
            let curr = first;
            while (curr < 15 && (board[placedTiles[i].i][curr] !== null || ((prevBoard[placedTiles[i].i][curr] !== null) && "text" in prevBoard[placedTiles[i].i][curr]))) {
                let tile = board[placedTiles[i].i][curr] || prevBoard[placedTiles[i].i][curr];
                let tileScore = tilePoints[tile.text];
                word += tile.text;
                if (prevBoard[placedTiles[i].i][curr] !== null && "modifier" in prevBoard[placedTiles[i].i][curr]) {
                    switch (prevBoard[placedTiles[i].i][curr].modifier[0]) {
                        case "x":
                            wordScore += tileScore * parseInt(prevBoard[placedTiles[i].i][curr].modifier[1]);
                            functions.logger.info(tile.text + (tileScore * parseInt(prevBoard[placedTiles[i].i][curr].modifier[1])) + "(" + tileScore + "*" + prevBoard[placedTiles[i].i][curr].modifier[1] + ")");
                            break;
                        case "+":
                            wordScore += tileScore + parseInt(prevBoard[placedTiles[i].i][curr].modifier[1]);
                            functions.logger.info(tile.text + (tileScore + parseInt(prevBoard[placedTiles[i].i][curr].modifier[1])) + "(" + tileScore + "+" + prevBoard[placedTiles[i].i][curr].modifier[1] + ")");
                            break;
                        default:
                            wordScore += tileScore;
                            functions.logger.info("didn't match: " + prevBoard[placedTiles[i].i][curr].modifier[0]);
                    }
                } else {
                    wordScore += tileScore;
                    functions.logger.info(tile.text + tileScore);
                }
                checked[placedTiles[i].i][curr].vert = true;
                curr++;
            }
            if (word.length > 1) {
                words.push({ word: word, i: placedTiles[i].i, j: --curr, valid: false });
                score += wordScore;
            }
        }
    }

    if (words.length > 0) {
        for (const word of words) {
            // Find in db
            console.log("Looking in db...");
            let doc = await db.collection('words').doc(word.word).get();
            if (doc.exists) {
                word.valid = true;
                console.log("Internal db: " + word.word);
            } else {
                // Find in Owlbot
                let response = await fetch(`https://owlbot.info/api/v4/dictionary/${word.word}`,
                    {
                        headers: {
                            'Authorization': 'Token 54a3b5de2da6bb715fe6781dda2b4bd07c2f505a'
                        }
                    });
                if (response.ok) {
                    word.valid = true;
                    console.log("Owlbot: " + word.word);
                } else {
                    // Find in Wordnik
                    let response = await fetch(`http://api.wordnik.com/v4/word.json/${word.word.toLowerCase()}/hyphenation?api_key=lpozch44b5sy76y9y7qbct0gqxc53qoo1sl3p5q03u513khgk`);
                    if (response.ok) {
                        word.valid = true;
                        console.log("Wordnik: " + word.word);
                    }
                }
            }
        }
    }

    return { words: words, board: board, placedTiles: placedTiles, score: score };
}

/**
 * Surrenders the game
 * @param {Object} data - Contains the game id
 */
exports.surrender = functions.https.onCall(async (data, context) => {
    let gameRef = db.collection("readGames").doc(data.gameId);
    let gameData = await gameRef.get();
    gameData = gameData.data();

    if (gameData.turn == context.auth.token.uid) {
        let winner = gameData.p1 == context.auth.token.uid ? gameData.p2 : gameData.p1;
        endGame(data.gameId, winner, "surrender");

        return { winner: winner };
    } else {
        return { error: "Not your turn" };
    }
});

/**
 * End a game if no move has been made in 24 hours
 */
exports.endGame = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
    functions.logger.log("Running regular functions...");
    let games = await db.collection("readGames").get();
    games.forEach(async (game) => {
        let gameData = game.data();
        if (!("winner" in gameData) && gameData.lastMoveTime && (Date.now() - gameData.lastMoveTime.toDate() > (24 * 60 * 60 * 1000))) {
            let winner = gameData.p1 == gameData.turn ? gameData.p2 : gameData.p1;
            endGame(game.id, winner, "time");
        }
    });
});

/**
 * Makes a move on the board if the move is valid
 * @param {boardData} data - The board data
 */
exports.makeMove = functions.https.onCall(async (data, context) => {
    let gameRef = db.collection("readGames").doc(data.gameId);

    let gameData = await gameRef.get();
    gameData = gameData.data();

    if (gameData.turn == context.auth.token.uid) {
        let words = await findWords(data, gameData);
        let prevBoard = [];
        for (let i = 0; i <= 15; i++) {
            prevBoard.push(gameData.board['row' + i]);
        }

        let tileRef = db.collection("hiddenGames").doc(data.gameId);
        let tileData = tileRef.get();
        let tiles = (await tileData).data();
        tiles = tiles[context.auth.token.uid == gameData.p1 ? "p1Tiles" : "p2Tiles"];
        functions.logger.info(tiles);

        for (let tile of words.placedTiles) {
            let index = tiles.indexOf(tile.tile);
            if (index >= 0) {
                tiles.splice(index, 1);
            } else {
                return "invalid";
            }
        }
        functions.logger.info(tiles);
        if ("words" in words) {
            // Check if all words are valid
            let valid = true;
            for (let i = 0; i < words.words.length; i++) {
                if (!words.words[i].valid) {
                    valid = false;
                }
            }
            if (valid) {
                // Update board
                let board = {};
                for (let i = 0; i < 15; i++) {
                    let row = [];
                    for (let j = 0; j < 15; j++) {
                        if (prevBoard[i][j] !== null) {
                            row.push(Object.assign(prevBoard[i][j], data.board[i][j]));
                        } else {
                            row.push(data.board[i][j]);
                        }
                    }
                    board["row" + i] = row;
                }
                gameData.moves.push({ words: words.words, player: context.auth.token.uid, score: words.score });
                let toUpdate = { board: board, moves: gameData.moves, turn: (context.auth.token.uid == gameData.p1 ? gameData.p2 : gameData.p1), lastMoveTime: admin.firestore.Timestamp.fromDate(new Date()) };
                let scoreVar = context.auth.token.uid == gameData.p1 ? "p1Score" : "p2Score";
                toUpdate[scoreVar] = gameData[scoreVar] += words.score;
                gameRef.update(toUpdate);

                // End game if score is over 200
                functions.logger.info("score: " + toUpdate[scoreVar]);
                if (parseInt(toUpdate[scoreVar]) >= 200) {
                    functions.logger.info("ending game");
                    await endGame(data.gameId, context.auth.token.uid, "points");
                } else {

                    // Clear realtime board
                    let blankBoard = {};
                    for (let i = 0; i < 15; i++) {
                        let row = [];
                        for (let j = 0; j < 15; j++) {
                            row.push(null);
                        }
                        blankBoard["row" + i] = row;
                    }
                    db.collection("writeGames").doc(data.gameId).update({ tempBoard: blankBoard });

                    let tilesList = "ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWYAEIOUAEIOUCSTHLNMRE";
                    while (tiles.length < 7) {
                        tiles.push(tilesList[Math.floor(Math.random() * tilesList.length)]);
                    }
                    if (context.auth.token.uid == gameData.p1) {
                        tileRef.update({ p1Tiles: tiles });
                    } else {
                        tileRef.update({ p2Tiles: tiles });
                    }
                }
                return "valid";
            } else {
                return "invalid";
            }
        } else {
            return "invalid";
        }
    } else {
        return "invalid";
    }
});

/**
 * Gets the current user's tile info from the database
 * @param {string} data - The id of the game
 */
exports.getTileInfo = functions.https.onCall(async (data, context) => {
    let player = "";
    return db.collection("readGames").doc(data).get()
        .then((gameData) => {
            gameData = gameData.data();
            if (context.auth.token.uid == gameData.p1) {
                player = "p1Tiles";
            } else if (context.auth.token.uid == gameData.p2) {
                player = "p2Tiles";
            }

            return db.collection("hiddenGames").doc(data).get()
                .then((turnData) => {
                    turnData = turnData.data();
                    return turnData[player];
                })
                .catch((error) => {
                    functions.logger.warn(error);
                    return null;
                });
        })
        .catch((error) => {
            functions.logger.warn(error);
            return null;
        });
});

/**
 * Gets the name and profile picture of a user
 * @param {string} - The user's id
 */
exports.getUserInfo = functions.https.onCall(async (data, context) => {
    return admin.auth().getUser(data)
        .then((userRecord) => {
            return { displayName: userRecord.displayName, photoURL: userRecord.photoURL, uid: userRecord.uid };
        })
        .catch((error) => {
            functions.logger.warn(error);
            return null;
        });
});

/**
 * Finds a user to play with and starts a game
 * @returns {string} - The id of the match found
 */
exports.findMatch = functions.https.onCall(async (data, context) => {
    let userId = context.auth.token.uid;
    let matchmakingCollection = db.collection("matchmaking");

    // See if a player is waiting
    let querySnapshot = await matchmakingCollection.where("match", "==", null).where("player", "!=", userId).limit(1).get();
    if (querySnapshot.empty) {
        // Add player id to list
        await matchmakingCollection.add({ player: userId, match: null });
        // Listen for match

        let unsub = function () { };

        // Set timeout function
        let timeout = new Promise((resolve, reject) => {
            setTimeout(async function () {
                unsub();

                // Remove existing queries
                let existing = await matchmakingCollection.where("player", "==", userId).get();
                existing.forEach(function (doc) {
                    doc.ref.delete();
                });

                resolve(null);
            }, 30000)
        })

        // Wait for a match to be set
        let matchPromise = new Promise((resolve, reject) => {
            unsub = matchmakingCollection.where("player", "==", userId).orderBy("match").startAfter(null).limit(1)
                .onSnapshot(function (snapshot) {
                    snapshot.forEach(function (doc) {
                        let matchId = doc.data().match;
                        doc.ref.delete();
                        unsub();
                        resolve(matchId);
                    });
                });
        });

        return Promise.race([timeout, matchPromise]);
    } else {
        // Player is waiting
        // Set match
        let matchPromise = new Promise((resolve, reject) => {
            let gameId;
            let matchId;
            querySnapshot.forEach(async function (doc) {
                matchId = doc.data().player;

                // Add game to db
                let board = {};
                for (let i = 0; i < 15; i++) {
                    let row = [];
                    for (let j = 0; j < 15; j++) {
                        row.push(null);
                    }
                    board["row" + i] = row;
                }

                board["row7"][7] = { modifier: "start" };

                // Add random modifiers to board
                let modifiers = ['x2', 'x3', 'x2', 'x3', '+1', '+2', '+3', '+4', '+1', '+2', '+5', 'x2', 'x3', 'x2'];
                for (let tile of modifiers) {
                    let i = Math.floor(Math.random() * 15);
                    let j = Math.floor(Math.random() * 15);
                    while (board['row' + i][j]) {
                        let i = Math.floor(Math.random() * 15);
                        let j = Math.floor(Math.random() * 15);
                    }
                    board['row' + i][j] = { modifier: tile };
                }

                // Randomise tiles
                let tiles = "ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWYAEIOUAEIOUCSTHLNMRE";
                p1Tiles = []
                p2Tiles = []
                for (let i = 0; i < 7; i++) {
                    p1Tiles.push(tiles[Math.floor(Math.random() * tiles.length)]);
                    p2Tiles.push(tiles[Math.floor(Math.random() * tiles.length)]);
                }
                let game = await db.collection("readGames").add({ board: board, startTime: admin.firestore.Timestamp.fromDate(new Date()), p1: userId, p2: matchId, p1Score: 0, p2Score: 0, turn: userId, moves: [] });
                gameId = game.id;
                await db.collection("writeGames").doc(gameId).set({ tempBoard: board });
                await db.collection("hiddenGames").doc(gameId).set({ p1Tiles: p1Tiles, p2Tiles: p2Tiles });
                doc.ref.update({ match: gameId });
                resolve(gameId);
            });
        });
        return matchPromise;
    }
});

exports.validateWords = functions.https.onCall(async (data, context) => {
    let gameData = await db.collection("readGames").doc(data.gameId).get();
    gameData = gameData.data();
    return findWords(data, gameData);
});