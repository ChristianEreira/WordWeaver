dayjs.extend(window.dayjs_plugin_relativeTime);

window.addEventListener('load', function () {
    let db = firebase.firestore();

    firebase.auth().onAuthStateChanged(async function (user) {
        if (user) {
            // User is signed in.
            document.querySelector('#details').textContent = user.displayName;
            document.querySelector('#image').src = user.photoURL || '../images/defaultUser.svg';

            document.querySelector('#newGameButton').onclick = e => {
                document.querySelector("#newGamePopup").classList.remove('hidden');

                let findMatch = firebase.functions().httpsCallable('findMatch');
                findMatch().then(function (result) {
                    if (result.data) {
                        document.querySelector("#newGamePopup").classList.add('hidden');
                        document.querySelector("#foundGamePopup").classList.remove('hidden');
                        window.location.href = window.location.href + "play/" + result.data;
                    } else {
                        console.log("Could not find match");
                        document.querySelector("#newGamePopup").classList.add('hidden');
                        document.querySelector("#noGamePopup").classList.remove('hidden');
                    }
                });
            }

            let games = [];
            let completedGames = [];
            let p1games = await db.collection("readGames").where("p1", "==", user.uid).get();
            p1games.forEach((doc) => {
                let gameData = doc.data();
                gameData.id = doc.id;
                if ("winner" in gameData) {
                    completedGames.push(gameData);
                } else {
                    games.push(gameData);
                }
            });
            let p2games = await db.collection("readGames").where("p2", "==", user.uid).get();
            p2games.forEach((doc) => {
                let gameData = doc.data();
                gameData.id = doc.id;
                if ("winner" in gameData) {
                    completedGames.push(gameData);
                } else {
                    games.push(gameData);
                }
            });

            games.sort((a, b) => (a.turn !== user.uid || b.startTime.seconds - a.startTime.seconds));
            completedGames.sort((a, b) => (b.winTime.seconds - a.winTime.seconds));

            let gamesList = document.querySelector("#gamesList");
            gamesList.innerHTML = "";
            let getUserInfo = firebase.functions().httpsCallable('getUserInfo');
            let p1Info;
            let p2Info;
            for (let game of games) {
                if (game.p1 == user.uid) {
                    p1Info = user;
                    p2Info = (await getUserInfo(game.p2)).data;
                } else {
                    p1Info = (await getUserInfo(game.p1)).data;
                    p2Info = user;
                }

                gamesList.innerHTML += `
                    <div class="gameCard ${game.turn === user.uid ? "current" : ""}" onclick='window.location.href = window.location.href + "play/${game.id}"'>
                        <div class="cardCapsule ${game.turn === user.uid ? "current" : ""}">${game.turn === user.uid ? "Your turn" : "Their turn"}</div>
                        <div class="smallScores">
                            <div class="smallScoreLine">
                                <img src="${p1Info.photoURL || '../images/defaultUser.svg'}" alt="" class="${game.turn === game.p1 ? "current" : ""}">
                                <p>${p1Info.displayName.split(' ')[0]}</p>
                                <p>${game.p1Score}</p>
                            </div>
                            <div class="smallScoreLine">
                                <img src="${p2Info.photoURL || '../images/defaultUser.svg'}" alt="" class="${game.turn === game.p2 ? "current" : ""}">
                                <p>${p2Info.displayName.split(' ')[0]}</p>
                                <p>${game.p2Score}</p>
                            </div>
                        </div>
                        <div class="cardFooter">${dayjs(game.startTime.toDate()).fromNow()}</div>
                    </div>`;
            }

            if (games.length === 0) {
                gamesList.innerHTML = "<p><i>You haven't got any active games yet!</i></p>";
            }

            let completedGamesList = document.querySelector("#completedGamesList");
            completedGamesList.innerHTML = "";
            for (let game of completedGames) {
                if (game.p1 == user.uid) {
                    p1Info = user;
                    p2Info = (await getUserInfo(game.p2)).data;
                } else {
                    p1Info = (await getUserInfo(game.p1)).data;
                    p2Info = user;
                }

                completedGamesList.innerHTML += `
                    <div class="gameCard ${game.winner === user.uid ? "won" : "lost"}" onclick='window.location.href = window.location.href + "play/${game.id}"'>
                        <div class="smallScores">
                            <div class="smallScoreLine">
                                <img src="${p1Info.photoURL || '../images/defaultUser.svg'}" alt="" class="${game.turn === game.p1 ? "current" : ""}">
                                <p>${p1Info.displayName.split(' ')[0]}</p>
                                <p>${game.p1Score}</p>
                            </div>
                            <div class="smallScoreLine">
                                <img src="${p2Info.photoURL || '../images/defaultUser.svg'}" alt="" class="${game.turn === game.p2 ? "current" : ""}">
                                <p>${p2Info.displayName.split(' ')[0]}</p>
                                <p>${game.p2Score}</p>
                            </div>
                        </div>
                        <div class="cardFooter">${dayjs(game.winTime.toDate()).fromNow()}</div>
                    </div>`;
            }

            if (completedGames.length === 0) {
                completedGamesList.innerHTML = "<p><i>You haven't completed any games yet!</i></p>";
            }
        } else {
            // User is signed out.
            window.location = '../sign-in.html';
        }
    }, function (error) {
        console.log(error);
    });

    document.querySelector("#signOutLink").onclick = e => {
        e.preventDefault();
        firebase.auth().signOut();
    }
});