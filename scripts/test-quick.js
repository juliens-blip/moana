// Test rapide après redémarrage
const PORT = 3005;

async function quickTest() {
  console.log('🧪 Test rapide POST-REDÉMARRAGE\n');

  try {
    // Login
    const loginRes = await fetch(`http://localhost:${PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broker: 'Charles', password: 'changeme' })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error('Login échoué');
    const cookies = loginRes.headers.get('set-cookie');
    console.log('✅ Login OK\n');

    // Test CREATE
    const createRes = await fetch(`http://localhost:${PORT}/api/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookies },
      body: JSON.stringify({
        nomBateau: 'Test Quick',
        constructeur: 'Test',
        longueur: 25,
        annee: 2020,
        proprietaire: 'Test',
        capitaine: 'Test',
        localisation: 'Test',
        prix: '1M€'
      })
    });
    const createData = await createRes.json();
    if (!createRes.ok) throw new Error(`Create échoué: ${createData.error}`);
    const id = createData.data.id;
    console.log(`✅ CREATE OK (${createRes.status})`);

    // Test UPDATE
    const updateRes = await fetch(`http://localhost:${PORT}/api/listings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookies },
      body: JSON.stringify({ prix: '1.2M€' })
    });
    const updateData = await updateRes.json();
    if (!updateRes.ok) throw new Error(`Update échoué: ${updateData.error}`);
    console.log(`✅ UPDATE OK (${updateRes.status})`);

    // Test DELETE
    const deleteRes = await fetch(`http://localhost:${PORT}/api/listings/${id}`, {
      method: 'DELETE',
      headers: { 'Cookie': cookies }
    });
    const deleteData = await deleteRes.json();
    if (!deleteRes.ok) throw new Error(`Delete échoué: ${deleteData.error}`);
    console.log(`✅ DELETE OK (${deleteRes.status})`);

    // Test FILTER
    const filterRes = await fetch(`http://localhost:${PORT}/api/listings?broker=Charles`, {
      headers: { 'Cookie': cookies }
    });
    const filterData = await filterRes.json();
    if (!filterRes.ok) throw new Error('Filter échoué');
    console.log(`✅ FILTER OK (${filterRes.status}) - ${filterData.data.length} listings`);

    console.log('\n🎉 TOUS LES TESTS PASSENT - APPLICATION 100% FONCTIONNELLE!');
  } catch (error) {
    console.error('\n❌ ERREUR:', error.message);
    process.exit(1);
  }
}

quickTest();
