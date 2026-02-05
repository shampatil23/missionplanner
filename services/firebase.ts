import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onValue, update, DatabaseReference } from "firebase/database";
import { MedicineRequest, MissionStatus } from "../types";

const firebaseConfig = {
  apiKey: "AIzaSyA08yFTF8sg1URH7KyFdKhCAkiVpOufDuI",
  authDomain: "airlink-a42ad.firebaseapp.com",
  databaseURL: "https://airlink-a42ad-default-rtdb.firebaseio.com",
  projectId: "airlink-a42ad",
  storageBucket: "airlink-a42ad.firebasestorage.app",
  messagingSenderId: "957908436764",
  appId: "1:957908436764:web:d764275d4a12c1b3799cd9",
  measurementId: "G-NKD9XSCF89"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export const requestsRef = ref(db, 'requests');

export const createRequest = (request: Omit<MedicineRequest, 'id'>) => {
  return push(requestsRef, request);
};

export const updateRequestStatus = (id: string, status: MissionStatus) => {
  const requestRef = ref(db, `requests/${id}`);
  return update(requestRef, { status });
};

export const assignDroneToRequest = (requestId: string, droneId: string) => {
  const requestRef = ref(db, `requests/${requestId}`);
  return update(requestRef, { droneId });
};

export const subscribeToRequests = (callback: (requests: MedicineRequest[]) => void) => {
  return onValue(requestsRef, (snapshot) => {
    const data = snapshot.val();
    const loadedRequests: MedicineRequest[] = [];
    if (data) {
      Object.keys(data).forEach((key) => {
        loadedRequests.push({
          id: key,
          ...data[key],
        });
      });
    }
    // Sort by timestamp descending
    loadedRequests.sort((a, b) => b.timestamp - a.timestamp);
    callback(loadedRequests);
  });
};