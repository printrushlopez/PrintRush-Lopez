let supabase = null;
let currentFile = null;
let shopId = null;

async function init() {
  // Get ENV vars securely from main process
  const env = await window.electronAPI.getEnv();
  
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    document.getElementById('queueList').innerHTML = '<div style="color:red">Missing Supabase ENV vars. Please configure .env file.</div>';
    return;
  }
  
  shopId = env.SHOP_ID || 1; // Default to 1 if not set
  supabase = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  
  loadQueue();
  subscribeQueue();

  // Listen for Bluetooth files from main process
  window.electronAPI.onBluetoothFileReceived((fileInfo) => {
    currentFile = fileInfo;
    document.getElementById('fileNameDisplay').textContent = `> ${fileInfo.name}\nSize: ${(fileInfo.size/1024).toFixed(1)} KB`;
    document.getElementById('walkinModal').classList.add('open');
  });

  // UI Buttons
  document.getElementById('cancelWalkinBtn').addEventListener('click', () => {
    document.getElementById('walkinModal').classList.remove('open');
    currentFile = null;
  });

  document.getElementById('createWalkinBtn').addEventListener('click', createJob);
}

async function loadQueue() {
  const list = document.getElementById('queueList');
  if (!supabase) return;
  
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('shop_id', shopId)
    .in('job_status', ['pending', 'processing'])
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = `<div style="color:var(--magenta)">Error loading queue: ${error.message}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = `<div style="color:var(--text-muted);font-size:14px;font-style:italic;">Queue is currently empty.</div>`;
    return;
  }

  list.innerHTML = data.map(job => `
    <div class="mirror-item">
      <div>
        <div style="font-weight:bold;color:var(--cyan)">#${job.job_number}</div>
        <div style="font-size:12px;color:var(--text-muted)">Walk-in • ${job.service_type || 'Document'}</div>
      </div>
      <div>
        <span class="badge ${job.job_status === 'pending' ? 'badge-yellow' : 'badge-cyan'}">${job.job_status.toUpperCase()}</span>
      </div>
    </div>
  `).join('');
}

function subscribeQueue() {
  if (!supabase) return;
  supabase.channel('public:jobs')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `shop_id=eq.${shopId}` }, () => {
      loadQueue();
    })
    .subscribe();
}

async function createJob() {
  if (!currentFile || !supabase) return;
  
  const btn = document.getElementById('createWalkinBtn');
  btn.textContent = 'Uploading...';
  btn.disabled = true;

  // Ideally, here we would read the file via Node `fs` in the main process,
  // but since we are demonstrating the flow:
  // We'll just create the job record. A full implementation would read the binary and upload to Supabase Storage.
  
  const service = document.getElementById('serviceSelect').value;
  const pgs = parseInt(document.getElementById('pagesInput').value) || 1;
  const cps = parseInt(document.getElementById('copiesInput').value) || 1;
  
  // Fake upload delay
  await new Promise(r => setTimeout(r, 600));
  
  const { error } = await supabase.from('jobs').insert([{
    shop_id: shopId,
    job_number: Math.floor(1000 + Math.random() * 9000),
    service_category: service,
    service_type: service === 'documents' ? 'Black & White' : 'Standard',
    pages: pgs,
    copies: cps,
    payment_method: 'cash_pickup',
    payment_status: 'pending',
    job_status: 'pending',
    pickup_type: 'pickup',
    device_fingerprint: 'WALKIN_BT', // Tag as bluetooth walk-in
    file_url: 'file://' + currentFile.path // Store local path as reference
  }]);

  btn.textContent = 'Add to Queue';
  btn.disabled = false;

  if (error) {
    alert('Failed to add job: ' + error.message);
  } else {
    document.getElementById('walkinModal').classList.remove('open');
    currentFile = null;
    loadQueue();
  }
}

init();
