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
  orderBy,
  limit,
  startAfter,
  getAggregateFromServer,
  sum,
  count
} from 'firebase/firestore';

// Generic CRUD operations (Legacy - returns array)
export const getCollection = async (collectionName, filters = [], orderByField = null) => {
  let q = collection(db, collectionName);
  
  if (filters.length > 0) {
    filters.forEach(([field, operator, value]) => {
      q = query(q, where(field, operator, value));
    });
  }

  if (orderByField) {
    q = query(q, orderBy(orderByField));
  }

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// Paginated CRUD operations
export const getCollectionPaginated = async (collectionName, filters = [], orderByField = null, limitCount = 50, lastDoc = null) => {
  let q = collection(db, collectionName);
  
  if (filters.length > 0) {
    filters.forEach(([field, operator, value]) => {
      q = query(q, where(field, operator, value));
    });
  }

  if (orderByField) {
    q = query(q, orderBy(orderByField));
  }

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  if (limitCount) {
    q = query(q, limit(limitCount));
  }

  const querySnapshot = await getDocs(q);
  
  const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const newLastDoc = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
  
  return { docs, lastDoc: newLastDoc };
};

// Server-side Aggregation
export const getCollectionAggregate = async (collectionName, sumFields = [], filters = []) => {
  let q = collection(db, collectionName);
  
  if (filters.length > 0) {
    filters.forEach(([field, operator, value]) => {
      q = query(q, where(field, operator, value));
    });
  }

  const aggregations = {
    totalCount: count()
  };

  sumFields.forEach(field => {
    aggregations[field] = sum(field);
  });

  const snapshot = await getAggregateFromServer(q, aggregations);
  return snapshot.data();
};

export const getRatioMixes = async () => {
  const docRef = doc(db, 'ratioMixer', 'sharedSettings');
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    return data.clients || [];
  }
  return [];
};

export const seedRawMaterials = async () => {
  const defaultMaterials = [
    { name: 'Goli', format: 'weight-based' },
    { name: 'Segregated Goli', format: 'weight-based' },
    { name: 'Fancy', format: 'weight-based' },
    { name: 'Non-Remy Double Drawn', format: 'length-based' },
    { name: 'Non-Remy 1x1', format: 'length-based' },
    { name: 'INHMR1x1', format: 'length-based' }
  ];
  
  const createdMats = [];
  for (const mat of defaultMaterials) {
    const docId = mat.name.replace(/\s+/g, '_').toLowerCase();
    await setDoc(doc(db, 'raw_materials', docId), mat, { merge: true });
    createdMats.push({ id: docId, ...mat });
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

export const seedMockData = async () => {
  try {
    // Seed Raw Materials
    await seedRawMaterials();

    // Add a Supplier
    const supplierRef = await addDoc(collection(db, 'suppliers'), {
      name: 'Tirupati Enterprises',
      code: 'TIR',
      contactInfo: { phone: '1234567890', email: 'tir@test.com' },
      priceLists: [
        { type: 'Goli', rate: 1000, weight: 100 },
        { type: 'Fancy', rate: 2000, weight: 50 }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Add a Lot
    await addDoc(collection(db, 'lots'), {
      supplierId: supplierRef.id,
      materialType: 'Goli',
      initialWeight: 100,
      remainingWeight: 100,
      totalCost: 100000,
      pricePerUnit: 1000,
      status: 'Raw',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    return true;
  } catch (err) {
    console.error("Error seeding mock data:", err);
    throw err;
  }
};
