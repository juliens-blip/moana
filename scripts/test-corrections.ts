/**
 * Test Script - Verification de toutes les corrections apportees
 *
 * Ce script teste systematiquement toutes les corrections effectuees sur l'application.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface TestResult {
  testName: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  details?: any;
  error?: any;
}

class TestRunner {
  private results: TestResult[] = [];
  private baseUrl = 'http://localhost:3000';

  async runAllTests() {
    console.log('\n==============================================');
    console.log('TEST DE VERIFICATION DES CORRECTIONS');
    console.log('==============================================\n');
    console.log(`Base URL: ${this.baseUrl}`);
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    // Tests infrastructure
    await this.testSupabaseConnection();

    // Tests brokers
    const charlesBrokerId = await this.getBrokerId('Charles');

    // Tests API Listings
    await this.testListingsFilterByBrokerName('Charles');
    if (charlesBrokerId) {
      await this.testListingsFilterByBrokerUUID(charlesBrokerId);
    }
    await this.testListingsFilterByNonExistentBroker();
    await this.testListingsFilterByLocation('Monaco');
    await this.testListingsSearch('Sunseeker');
    await this.testListingsCombinedFilters('Charles', 'Monaco');

    // Tests CRUD
    await this.testCreateListing();
    await this.testUpdateListing();

    // Afficher le rapport
    this.generateReport();
  }

  private async testSupabaseConnection() {
    try {
      const { data, error } = await supabase
        .from('brokers')
        .select('id, name')
        .limit(1);

      if (error) throw error;

      this.addResult({
        testName: 'Connexion Supabase',
        status: 'PASS',
        message: 'Connexion etablie avec succes',
        details: { recordsFound: data?.length || 0 }
      });
    } catch (error: any) {
      this.addResult({
        testName: 'Connexion Supabase',
        status: 'FAIL',
        message: 'Echec de connexion a Supabase',
        error: error.message
      });
    }
  }

  private async getBrokerId(brokerName: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('brokers')
        .select('id')
        .ilike('name', brokerName)
        .single();

      if (error || !data) {
        console.warn(`Broker "${brokerName}" non trouve`);
        return null;
      }

      console.log(`Broker "${brokerName}" trouve: ${data.id}`);
      return data.id;
    } catch (error) {
      console.error(`Erreur lors de la recuperation du broker "${brokerName}":`, error);
      return null;
    }
  }

  private async testListingsFilterByBrokerName(brokerName: string) {
    try {
      const url = `${this.baseUrl}/api/listings?broker=${encodeURIComponent(brokerName)}`;
      const response = await fetch(url);
      const data = await response.json();

      if (response.status !== 200) {
        throw new Error(`Status ${response.status}: ${data.error || 'Unknown error'}`);
      }

      this.addResult({
        testName: `Filtre broker par nom (${brokerName})`,
        status: 'PASS',
        message: `Reponse 200 OK avec ${data.data?.length || 0} listings`,
        details: {
          url,
          status: response.status,
          listingsCount: data.data?.length || 0,
          sampleListing: data.data?.[0] || null
        }
      });
    } catch (error: any) {
      this.addResult({
        testName: `Filtre broker par nom (${brokerName})`,
        status: 'FAIL',
        message: 'Erreur lors du filtrage par nom de broker',
        error: error.message
      });
    }
  }

  private async testListingsFilterByBrokerUUID(brokerId: string) {
    try {
      const url = `${this.baseUrl}/api/listings?broker=${encodeURIComponent(brokerId)}`;
      const response = await fetch(url);
      const data = await response.json();

      if (response.status !== 200) {
        throw new Error(`Status ${response.status}: ${data.error || 'Unknown error'}`);
      }

      this.addResult({
        testName: 'Filtre broker par UUID',
        status: 'PASS',
        message: `Reponse 200 OK avec ${data.data?.length || 0} listings`,
        details: {
          url,
          brokerId,
          status: response.status,
          listingsCount: data.data?.length || 0
        }
      });
    } catch (error: any) {
      this.addResult({
        testName: 'Filtre broker par UUID',
        status: 'FAIL',
        message: 'Erreur lors du filtrage par UUID de broker',
        error: error.message
      });
    }
  }

  private async testListingsFilterByNonExistentBroker() {
    try {
      const url = `${this.baseUrl}/api/listings?broker=BrokerInexistant123`;
      const response = await fetch(url);
      const data = await response.json();

      if (response.status !== 200) {
        throw new Error(`Status ${response.status}: ${data.error || 'Unknown error'}`);
      }

      const isEmpty = !data.data || data.data.length === 0;

      this.addResult({
        testName: 'Filtre broker inexistant',
        status: isEmpty ? 'PASS' : 'FAIL',
        message: isEmpty
          ? 'Reponse 200 OK avec tableau vide (comme attendu)'
          : `Reponse inattendue: ${data.data.length} listings trouvés`,
        details: {
          url,
          status: response.status,
          listingsCount: data.data?.length || 0
        }
      });
    } catch (error: any) {
      this.addResult({
        testName: 'Filtre broker inexistant',
        status: 'FAIL',
        message: 'Erreur lors du test de broker inexistant',
        error: error.message
      });
    }
  }

  private async testListingsFilterByLocation(location: string) {
    try {
      const url = `${this.baseUrl}/api/listings?location=${encodeURIComponent(location)}`;
      const response = await fetch(url);
      const data = await response.json();

      if (response.status !== 200) {
        throw new Error(`Status ${response.status}: ${data.error || 'Unknown error'}`);
      }

      this.addResult({
        testName: `Filtre localisation (${location})`,
        status: 'PASS',
        message: `Reponse 200 OK avec ${data.data?.length || 0} listings`,
        details: {
          url,
          status: response.status,
          listingsCount: data.data?.length || 0
        }
      });
    } catch (error: any) {
      this.addResult({
        testName: `Filtre localisation (${location})`,
        status: 'FAIL',
        message: 'Erreur lors du filtrage par localisation',
        error: error.message
      });
    }
  }

  private async testListingsSearch(searchTerm: string) {
    try {
      const url = `${this.baseUrl}/api/listings?search=${encodeURIComponent(searchTerm)}`;
      const response = await fetch(url);
      const data = await response.json();

      if (response.status !== 200) {
        throw new Error(`Status ${response.status}: ${data.error || 'Unknown error'}`);
      }

      this.addResult({
        testName: `Recherche (${searchTerm})`,
        status: 'PASS',
        message: `Reponse 200 OK avec ${data.data?.length || 0} listings`,
        details: {
          url,
          status: response.status,
          listingsCount: data.data?.length || 0
        }
      });
    } catch (error: any) {
      this.addResult({
        testName: `Recherche (${searchTerm})`,
        status: 'FAIL',
        message: 'Erreur lors de la recherche',
        error: error.message
      });
    }
  }

  private async testListingsCombinedFilters(broker: string, location: string) {
    try {
      const url = `${this.baseUrl}/api/listings?broker=${encodeURIComponent(broker)}&location=${encodeURIComponent(location)}`;
      const response = await fetch(url);
      const data = await response.json();

      if (response.status !== 200) {
        throw new Error(`Status ${response.status}: ${data.error || 'Unknown error'}`);
      }

      this.addResult({
        testName: `Filtres combines (broker + location)`,
        status: 'PASS',
        message: `Reponse 200 OK avec ${data.data?.length || 0} listings`,
        details: {
          url,
          broker,
          location,
          status: response.status,
          listingsCount: data.data?.length || 0
        }
      });
    } catch (error: any) {
      this.addResult({
        testName: `Filtres combines (broker + location)`,
        status: 'FAIL',
        message: 'Erreur lors du test des filtres combines',
        error: error.message
      });
    }
  }

  private async testCreateListing() {
    try {
      // D'abord recuperer un broker_id valide
      const { data: brokers } = await supabase
        .from('brokers')
        .select('id')
        .limit(1);

      if (!brokers || brokers.length === 0) {
        this.addResult({
          testName: 'Creation de listing',
          status: 'SKIP',
          message: 'Aucun broker disponible pour le test'
        });
        return;
      }

      const brokerId = brokers[0].id;

      const newListing = {
        name: `Test Yacht ${Date.now()}`,
        builder: 'Test Builder',
        length: 25.5,
        year: 2023,
        owner: 'Test Owner',
        captain: 'Test Captain',
        broker_id: brokerId,
        location: 'Test Location',
        price: 1000000,
        last_message: 'Test message',
        comment: 'Test comment'
      };

      const url = `${this.baseUrl}/api/listings`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newListing)
      });

      const data = await response.json();

      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Status ${response.status}: ${data.error || 'Unknown error'}`);
      }

      // Nettoyer: supprimer le listing de test
      if (data.data?.id) {
        await supabase
          .from('listings')
          .delete()
          .eq('id', data.data.id);
      }

      this.addResult({
        testName: 'Creation de listing',
        status: 'PASS',
        message: 'Listing cree avec succes',
        details: {
          url,
          status: response.status,
          createdId: data.data?.id,
          broker_id: brokerId
        }
      });
    } catch (error: any) {
      this.addResult({
        testName: 'Creation de listing',
        status: 'FAIL',
        message: 'Erreur lors de la creation de listing',
        error: error.message
      });
    }
  }

  private async testUpdateListing() {
    try {
      // Creer un listing de test
      const { data: brokers } = await supabase
        .from('brokers')
        .select('id')
        .limit(1);

      if (!brokers || brokers.length === 0) {
        this.addResult({
          testName: 'Modification de listing',
          status: 'SKIP',
          message: 'Aucun broker disponible pour le test'
        });
        return;
      }

      const brokerId = brokers[0].id;

      const { data: created, error: createError } = await supabase
        .from('listings')
        .insert({
          name: `Test Update Yacht ${Date.now()}`,
          builder: 'Test Builder',
          length: 25.5,
          year: 2023,
          owner: 'Test Owner',
          captain: 'Test Captain',
          broker_id: brokerId,
          location: 'Test Location'
        })
        .select()
        .single();

      if (createError || !created) {
        throw new Error('Impossible de creer un listing de test');
      }

      // Modifier le listing
      const updatedData = {
        name: 'Updated Yacht Name',
        location: 'Updated Location'
      };

      const url = `${this.baseUrl}/api/listings/${created.id}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedData)
      });

      const data = await response.json();

      if (response.status !== 200) {
        throw new Error(`Status ${response.status}: ${data.error || 'Unknown error'}`);
      }

      // Verifier que les modifications sont appliquees
      const nameUpdated = data.data?.name === updatedData.name;
      const locationUpdated = data.data?.location === updatedData.location;

      // Nettoyer
      await supabase
        .from('listings')
        .delete()
        .eq('id', created.id);

      this.addResult({
        testName: 'Modification de listing',
        status: (nameUpdated && locationUpdated) ? 'PASS' : 'FAIL',
        message: (nameUpdated && locationUpdated)
          ? 'Listing modifie avec succes'
          : 'Les modifications ne sont pas toutes appliquees',
        details: {
          url,
          status: response.status,
          listingId: created.id,
          nameUpdated,
          locationUpdated,
          updatedListing: data.data
        }
      });
    } catch (error: any) {
      this.addResult({
        testName: 'Modification de listing',
        status: 'FAIL',
        message: 'Erreur lors de la modification de listing',
        error: error.message
      });
    }
  }

  private addResult(result: TestResult) {
    this.results.push(result);
    const icon = result.status === 'PASS' ? '✓' : result.status === 'FAIL' ? '✗' : '○';
    const statusColor = result.status === 'PASS' ? '\x1b[32m' : result.status === 'FAIL' ? '\x1b[31m' : '\x1b[33m';
    console.log(`${statusColor}${icon}\x1b[0m ${result.testName}: ${result.message}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }

  private generateReport() {
    console.log('\n==============================================');
    console.log('RAPPORT DE TEST');
    console.log('==============================================\n');

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const skipped = this.results.filter(r => r.status === 'SKIP').length;
    const total = this.results.length;

    console.log(`Total tests: ${total}`);
    console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
    console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
    console.log(`\x1b[33mSkipped: ${skipped}\x1b[0m`);
    console.log(`\nTaux de reussite: ${((passed / (total - skipped)) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log('\n\x1b[31mTESTS ECHOUES:\x1b[0m');
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => {
          console.log(`\n- ${r.testName}`);
          console.log(`  Message: ${r.message}`);
          if (r.error) {
            console.log(`  Error: ${r.error}`);
          }
          if (r.details) {
            console.log(`  Details: ${JSON.stringify(r.details, null, 2)}`);
          }
        });
    }

    console.log('\n==============================================\n');

    // Sauvegarder le rapport dans un fichier JSON
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total,
        passed,
        failed,
        skipped,
        successRate: ((passed / (total - skipped)) * 100).toFixed(1) + '%'
      },
      results: this.results
    };

    const fs = require('fs');
    const path = require('path');
    const reportPath = path.join(process.cwd(), 'test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Rapport sauvegarde dans: ${reportPath}\n`);
  }
}

// Executer les tests
const runner = new TestRunner();
runner.runAllTests().catch(console.error);
