const http = require('http');
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Load env + auth
const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
});

const authCookie = 'eyJhY2Nlc3NfdG9rZW4iOiJleUpoYkdjaU9pSkZVekkxTmlJc0ltdHBaQ0k2SW1RNU5XVXhZVEZpTFRrMU5UWXROR1psTUMxaVpESmpMVEkzWW1WbU5UYzROelZqTVNJc0luUjVjQ0k2SWtwWFZDSjkuZXlKcGMzTWlPaUpvZEhSd2N6b3ZMM0poWldSeWNtOW9jbmw0Y0dsaWJXMW9ZMnB2TG5OMWNHRmlZWE5sTG1OdkwyRjFkR2d2ZGpFaUxDSnpkV0lpT2lJeE9EbGhPR1EwTUMwM05EUmtMVFExTW1NdFlqY3hOaTAyTm1Ka1pqTmpaamc1TnpZaUxDSmhkV1FpT2lKaGRYUm9aVzUwYVdOaGRHVmtJaXdpWlhod0lqb3hOemN6T0RRMk9Ea3lMQ0pwWVhRaU9qRTNOek00TkRNeU9USXNJbVZ0WVdsc0lqb2lkbUZ5ZFc0dWRIbGhaMms0TTBCbmJXRnBiQzVqYjIwaUxDSndhRzl1WlNJNklpSXNJbUZ3Y0Y5dFpYUmhaR0YwWVNJNmV5SndjbTkyYVdSbGNpSTZJbVZ0WVdsc0lpd2ljSEp2ZG1sa1pYSnpJanBiSW1WdFlXbHNJbDE5TENKMWMyVnlYMjFsZEdGa1lYUmhJanA3SW1WdFlXbHNJam9pZG1GeWRXNHVkSGxoWjJrNE0wQm5iV0ZwYkM1amIyMGlMQ0psYldGcGJGOTJaWEpwWm1sbFpDSTZkSEoxWlN3aWNHaHZibVZmZG1WeWFXWnBaV1FpT21aaGJITmxMQ0p6ZFdJaU9pSXhPRGxoT0dRME1DMDNORFJrTFRRMU1tTXRZamN4TmkwMk5tSmtaak5qWmpnNU56WWlmU3dpY205c1pTSTZJbUYxZEdobGJuUnBZMkYwWldRaUxDSmhZV3dpT2lKaFlXd3hJaXdpWVcxeUlqcGJleUp0WlhSb2IyUWlPaUp3WVhOemQyOXlaQ0lzSW5ScGJXVnpkR0Z0Y0NJNk1UYzNNakV5TVRZNE9YMWRMQ0p6WlhOemFXOXVYMmxrSWpvaU9XWXlaV00zT0dNdFpUaG1PUzAwTnpGbUxUbGpNalV0T0RNMVl6Z3hOVE0zTXpkbUlpd2lhWE5mWVc1dmJubHRiM1Z6SWpwbVlXeHpaWDAucWpKbGpqY0V0bFR4OXZTWWd4dmNtTkExbWhmc1FCMTlrQ1NOX1d4RzY5QnpKbnJ4bGdyWkhDamZuTHBPdkpVSWxmTXY3X2dZcXNuNmdXVGQwSlZqN2ciLCJ0b2tlbl90eXBlIjoiYmVhcmVyIiwiZXhwaXJlc19pbiI6MzYwMCwiZXhwaXJlc19hdCI6MTc3Mzg0Njg5MiwicmVmcmVzaF90b2tlbiI6ImpraHJ3cGc0a3o2bCIsInVzZXIiOnsiaWQiOiIxODlhOGQ0MC03NDRkLTQ1MmMtYjcxNi02NmJkZjNjZjg5NzYiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJlbWFpbCI6InZhcnVuLnR5YWdpODNAZ21haWwuY29tIiwiZW1haWxfY29uZmlybWVkX2F0IjoiMjAyNi0wMi0yMVQwNzoyMjowMC4xMjkwNThaIiwicGhvbmUiOiIiLCJjb25maXJtYXRpb25fc2VudF9hdCI6IjIwMjYtMDItMjFUMDc6MjE6NDAuOTgyMDJaIiwiY29uZmlybWVkX2F0IjoiMjAyNi0wMi0yMVQwNzoyMjowMC4xMjkwNThaIiwibGFzdF9zaWduX2luX2F0IjoiMjAyNi0wMy0xOFQxMzo1NjozNS4yNjA5NThaIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWwiOiJ2YXJ1bi50eWFnaTgzQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6IjE4OWE4ZDQwLTc0NGQtNDUyYy1iNzE2LTY2YmRmM2NmODk3NiJ9LCJpZGVudGl0aWVzIjpbeyJpZGVudGl0eV9pZCI6IjJiNDJiNzliLTg5YTUtNGVjOS1hZjM1LTIwNDljYTNlNWY5YiIsImlkIjoiMTg5YThkNDAtNzQ0ZC00NTJjLWI3MTYtNjZiZGYzY2Y4OTc2IiwidXNlcl9pZCI6IjE4OWE4ZDQwLTc0NGQtNDUyYy1iNzE2LTY2YmRmM2NmODk3NiIsImlkZW50aXR5X2RhdGEiOnsiZW1haWwiOiJ2YXJ1bi50eWFnaTgzQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6IjE4OWE4ZDQwLTc0NGQtNDUyYy1iNzE2LTY2YmRmM2NmODk3NiJ9LCJwcm92aWRlciI6ImVtYWlsIiwibGFzdF9zaWduX2luX2F0IjoiMjAyNi0wMi0yMVQwNzoyMTo0MC45MzU1MDlaIiwiY3JlYXRlZF9hdCI6IjIwMjYtMDItMjFUMDc6MjE6NDAuOTM4MzY2WiIsInVwZGF0ZWRfYXQiOiIyMDI2LTAyLTIxVDA3OjIxOjQwLjkzODM2NloiLCJlbWFpbCI6InZhcnVuLnR5YWdpODNAZ21haWwuY29tIn1dLCJjcmVhdGVkX2F0IjoiMjAyNi0wMi0yMVQwNzoyMTo0MC44NzU0NDZaIiwidXBkYXRlZF9hdCI6IjIwMjYtMDMtMThUMTQ6MTQ6NTIuNDc5NjI5WiIsImlzX2Fub255bW91cyI6ZmFsc2V9fQ';

const CATEGORY_ID = '530baae1-19c7-44d4-b6da-4efa1d0b8d47';
const BASE_URL = 'http://localhost:3006';

async function callAPI(endpoint, method, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${endpoint}`);
    const cookies = `sb-raedrrohryxpibmmhcjo-auth-token=base64-${authCookie}`;
    
    const options = {
      hostname: url.hostname,
      port: url.port || 3006,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const drive = google.drive({
    version: 'v3',
    auth: new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_DRIVE_CLIENT_EMAIL,
        private_key: env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    }),
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('IMAGE PIPELINE AUDIT - STEP 4: Generate + Save Composite');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Get the new background we just created
  const bgData = JSON.parse(fs.readFileSync('/tmp/pipeline-audit-data.json'));
  console.log(`\nUsing NEW background: ${bgData.backgroundName}`);
  console.log(`Background ID: ${bgData.backgroundId}`);

  // Get an angled shot
  const { data: angledShot } = await supabase
    .from('angled_shots')
    .select('*')
    .eq('category_id', CATEGORY_ID)
    .limit(1)
    .single();

  console.log(`Using angled shot: ${angledShot.display_name}`);
  console.log(`Angled Shot ID: ${angledShot.id}`);

  // Step 4a: Generate composite
  console.log('\n=== Step 4a: Generate Composite ===');
  const genResp = await callAPI(`/api/categories/${CATEGORY_ID}/composites/generate`, 'POST', {
    mode: 'selected',
    pairs: [{
      angledShotId: angledShot.id,
      backgroundId: bgData.backgroundId,
    }],
    format: '1:1',
  });

  if (genResp.status !== 200) {
    console.error('✗ Generation failed:', genResp.status, genResp.raw || genResp.data);
    process.exit(1);
  }

  console.log('✓ Composite generated');
  const comp = genResp.data.results[0];
  console.log(`  Image size: ${comp.image_base64.length} chars`);
  console.log(`  MIME: ${comp.image_mime_type}`);

  // Step 4b: Save composite
  console.log('\n=== Step 4b: Save Composite ===');
  const timestamp = Date.now();
  const saveResp = await callAPI(`/api/categories/${CATEGORY_ID}/composites`, 'POST', {
    name: `pipeline-audit-composite-mar18-${timestamp}`,
    imageData: comp.image_base64,
    mimeType: comp.image_mime_type,
    angledShotId: angledShot.id,
    backgroundId: bgData.backgroundId,
    format: '1:1',
    promptUsed: comp.prompt_used || 'Pipeline audit composite',
  });

  if (saveResp.status !== 201) {
    console.error('✗ Save failed:', saveResp.status, saveResp.raw || saveResp.data);
    process.exit(1);
  }

  console.log('✓ Composite saved');
  const saved = saveResp.data.composite;
  console.log(`  ID: ${saved.id}`);
  console.log(`  Name: ${saved.name}`);
  console.log(`  GDrive File ID: ${saved.gdrive_file_id}`);
  console.log(`  Storage path: ${saved.storage_path}`);

  // Step 4c: Verify metadata
  console.log('\n=== Step 4c: Inspect Supabase Metadata ===');
  const { data: dbRec } = await supabase.from('composites').select('*').eq('id', saved.id).single();
  console.log('✓ Database record verified:');
  console.log(`  angled_shot_id: ${dbRec.angled_shot_id} ✅`);
  console.log(`  background_id: ${dbRec.background_id} ✅`);
  console.log(`  storage_path: ${dbRec.storage_path}`);
  console.log(`  gdrive_file_id: ${dbRec.gdrive_file_id}`);
  console.log(`  created_at: ${dbRec.created_at}`);
  console.log(`  Has company prefix: ${dbRec.storage_path.startsWith('Sunday Natural/') ? '✅ YES' : '❌ NO'}`);

  // Verify in Drive
  console.log('\n=== Step 4d: Verify in Google Drive ===');
  const { data: fileInfo } = await drive.files.get({
    fileId: saved.gdrive_file_id,
    fields: 'id, name, size, createdTime',
    supportsAllDrives: true,
  });
  console.log('✓ File exists in Shared Drive');
  console.log(`  Name: ${fileInfo.name}`);
  console.log(`  Size: ${(parseInt(fileInfo.size) / 1024).toFixed(1)} KB`);
  console.log(`  Created: ${fileInfo.createdTime}`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ STEP 4 COMPLETE - Composite Generated & Saved');
  console.log(`\nComposite: ${saved.name}`);
  console.log(`Created: ${dbRec.created_at}`);
  console.log(`View: https://drive.google.com/file/d/${saved.gdrive_file_id}/view`);
  console.log(`Path: ${saved.storage_path}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Update audit data
  bgData.compositeId = saved.id;
  bgData.compositeGdriveId = saved.gdrive_file_id;
  bgData.compositeName = saved.name;
  fs.writeFileSync('/tmp/pipeline-audit-data.json', JSON.stringify(bgData, null, 2));
}

main().catch(err => {
  console.error('\n✗ ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
