let ui = new firebaseui.auth.AuthUI(firebase.auth());
let timer;

ui.start('#signin-container', {
    callbacks: {
        signInSuccessWithAuthResult: function (authResult, redirectUrl) {
            // console.log(authResult);
            return true;
        },
        uiShown: function () {
            document.querySelector('#loader').style.display = 'none';
            // Show email popup when email button clicked
            delayedOnclick("button[data-provider-id='password']", showEmailForm);
        }
    },
    signInFlow: 'popup',
    signInSuccessUrl: 'index.html',
    signInOptions: [
        {
            provider: firebase.auth.GoogleAuthProvider.PROVIDER_ID,
            clientId: '291009854850-23kojohrjnsqfl2afcm3j6c0tdtajhjs.apps.googleusercontent.com'
        },
        // firebase.auth.GoogleAuthProvider.PROVIDER_ID,
        firebase.auth.FacebookAuthProvider.PROVIDER_ID,
        firebase.auth.EmailAuthProvider.PROVIDER_ID,
    ],
    credentialHelper: firebaseui.auth.CredentialHelper.GOOGLE_YOLO,
    // tosUrl: 'tos url',
    // privacyPolicyUrl: 'privacy policy url'
});
ui.disableAutoSignIn();

firebase.auth().onAuthStateChanged(function (user) {
    if (user) {
        // User is signed in.
        window.location = '../';
    }
}, function (error) {
    console.log(error);
});

/**
 * Binds a elements onclick listener to a set function after 200ms
 * @param {element} elem - The clickable element
 * @param {element} func - The function to bind
 */
function delayedOnclick(elem, func) {
    timer = setInterval(function () {
        let button = document.querySelector(elem);
        if (button != null) {
            button.onclick = func;
            clearInterval(timer);
        }
    }, 200);
}

/**
 * Shows the popup and moves the UI into it
 * Adds listeners for hiding the popup again
 */
function showEmailForm() {
    // Go to email form view
    console.log("Email");
    document.querySelector("#emailPopup").classList.remove("hidden");
    document.querySelector("#emailPopup > .popupBox").appendChild(document.querySelector("#signin-container"));

    delayedOnclick("button.firebaseui-id-secondary-link", hideEmailForm);
    delayedOnclick("button.firebaseui-id-submit", showEmailForm);
}

/**
 * Hides the popup and moves the UI back out
 * Adds listener for showing the popup again
 */
function hideEmailForm() {
    // go back to button view
    console.log("Buttons");
    console.log("Email");
    document.querySelector("#emailPopup").classList.add("hidden");
    document.querySelector("#signInBox").appendChild(document.querySelector("#signin-container"));

    delayedOnclick("button[data-provider-id='password']", showEmailForm);
}