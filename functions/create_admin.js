const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

initializeApp({
  projectId: "inhsuite"
});

async function createAdmin() {
  const auth = getAuth();
  try {
    const userRecord = await auth.createUser({
      email: 'info@indiannaturalhair.com',
      password: 'Rapsol1976@@',
    });
    console.log('Successfully created new user:', userRecord.uid);
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      console.log('User already exists! Updating password just in case...');
      const user = await auth.getUserByEmail('info@indiannaturalhair.com');
      await auth.updateUser(user.uid, { password: 'Rapsol1976@@' });
      console.log('Password updated successfully.');
    } else {
      console.error('Error creating new user:', error);
    }
  }
}

createAdmin();
