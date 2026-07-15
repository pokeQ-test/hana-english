import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
    browserLocalPersistence,
    createUserWithEmailAndPassword,
    getAuth,
    onAuthStateChanged,
    sendPasswordResetEmail,
    setPersistence,
    signInWithEmailAndPassword,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
    doc,
    getDoc,
    getFirestore,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const config = window.HANA_FIREBASE_CONFIG || {};
const configured = Boolean(
    config.apiKey &&
    config.projectId &&
    !String(config.apiKey).startsWith("YOUR_") &&
    !String(config.projectId).startsWith("YOUR_")
);

let auth = null;
let db = null;

function dispatch(name, detail){
    window.dispatchEvent(new CustomEvent(name, { detail }));
}

function publicUser(user){
    if(!user){
        return null;
    }
    return {
        uid:user.uid,
        email:user.email || "",
        displayName:user.displayName || ""
    };
}

function requireFirebase(){
    if(!configured || !auth || !db){
        throw new Error("Firebase is not configured.");
    }
}

const service = {
    configured,

    async register(displayName, email, password){
        requireFirebase();
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName });
        await setDoc(doc(db, "users", credential.user.uid), {
            displayName,
            email:credential.user.email,
            createdAt:serverTimestamp(),
            updatedAt:serverTimestamp()
        }, { merge:true });
        dispatch("hana-auth-state", { user:publicUser(credential.user) });
    },

    async signIn(email, password){
        requireFirebase();
        await signInWithEmailAndPassword(auth, email, password);
    },

    async signOut(){
        requireFirebase();
        await signOut(auth);
    },

    async resetPassword(email){
        requireFirebase();
        await sendPasswordResetEmail(auth, email);
    },

    async loadProgress(type){
        requireFirebase();
        const snapshot = await getDoc(doc(db, "users", auth.currentUser.uid, "learning", type));
        return snapshot.exists() ? snapshot.data().records || {} : {};
    },

    async saveProgress(type, records){
        requireFirebase();
        await setDoc(doc(db, "users", auth.currentUser.uid, "learning", type), {
            records,
            updatedAt:serverTimestamp()
        }, { merge:true });
    }
};

window.hanaFirebase = service;
dispatch("hana-firebase-ready", { configured });

if(configured){
    const app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
    await setPersistence(auth, browserLocalPersistence);
    onAuthStateChanged(auth, user => {
        dispatch("hana-auth-state", { user:publicUser(user) });
    });
}
