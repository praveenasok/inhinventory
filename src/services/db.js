import { db } from './firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  orderBy
} from 'firebase/firestore';

// Generic CRUD operations
export const getCollection = async (collectionName, filters = [], orderByField = null) => {
  let q = collection(db, collectionName);
  
  if (filters.length > 0) {
    // Basic single filter support for now
    const [field, operator, value] = filters[0];
    q = query(q, where(field, operator, value));
  }

  if (orderByField) {
    q = query(q, orderBy(orderByField));
  }

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const seedRawMaterials = async () => {
  const defaultMaterials = [
    { name: 'Goli', format: 'weight-based' },
    { name: 'Fancy', format: 'weight-based' },
    { name: 'Non-Remy Double Drawn', format: 'length-based' },
    { name: 'Non-Remy 1x1', format: 'length-based' },
    { name: 'INHMR1x1', format: 'length-based' }
  ];
  
  const createdMats = [];
  for (const mat of defaultMaterials) {
    const docRef = await addDoc(collection(db, 'raw_materials'), mat);
    createdMats.push({ id: docRef.id, ...mat });
  }
  return createdMats;
};

export const getDocument = async (collectionName, id) => {
  const docRef = doc(db, collectionName, id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  return null;
};

export const addDocument = async (collectionName, data) => {
  const docRef = await addDoc(collection(db, collectionName), {
    ...data,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return docRef.id;
};

export const updateDocument = async (collectionName, id, data) => {
  const docRef = doc(db, collectionName, id);
  await updateDoc(docRef, {
    ...data,
    updatedAt: new Date()
  });
};

export const deleteDocument = async (collectionName, id) => {
  const docRef = doc(db, collectionName, id);
  await deleteDoc(docRef);
};

export const setDocument = async (collectionName, id, data) => {
  const docRef = doc(db, collectionName, id);
  await setDoc(docRef, {
    ...data,
    updatedAt: new Date()
  }, { merge: true });
};
