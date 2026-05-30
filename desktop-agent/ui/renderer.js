let supabaseClient = null;
let currentFile = null;
let shopId = null;

async function init() {
  // Get ENV vars securely from main process
  const env = await window.electronAPI.getEnv();
  
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    document.getElementById('queueList').innerHTML = '<div style="color:red">Missing Supabase ENV vars. Please configure .env file.</div>';
    return;
  }
  
  shopId = env.SHOP_ID || null;
  if (!shopId) {
    document.getElementById('queueList').innerHTML = '<div style="color:orange;font-size:14px;">⚠️ No Shop ID configured. Please re-run setup.</div>';
    return;
  }
  supabaseClient = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  
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
  if (!supabaseClient) return;
  
  // Fetch active and recent done jobs to calculate stats
  // Let's fetch all jobs from the last 24 hours to cover "today" + active ones
  const oneDayAgo = new Date();
  oneDayAgo.setHours(oneDayAgo.getHours() - 24);

  const { data, error } = await supabaseClient
    .from('jobs')
    .select('*')
    .eq('shop_id', shopId)
    .or(`job_status.in.(pending,processing),created_at.gte.${oneDayAgo.toISOString()}`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[PrintRUSH] Error fetching jobs:', error);
    list.innerHTML = `<div style="color:var(--magenta)">Error loading queue: ${error.message}</div>`;
    return;
  }

  // Filter jobs for stats
  const inProgressJobs = data.filter(job => job.job_status === 'processing');
  const waitingJobs = data.filter(job => job.job_status === 'pending');
  
  // Done today (today in local time)
  const todayStr = new Date().toDateString();
  const doneTodayJobs = data.filter(job => job.job_status === 'done' && new Date(job.created_at).toDateString() === todayStr);

  // Update Stats UI
  document.getElementById('statInProgress').textContent = inProgressJobs.length;
  document.getElementById('statWaiting').textContent = waitingJobs.length;
  document.getElementById('statDone').textContent = doneTodayJobs.length;

  // Filter jobs to display in "Recent Jobs" list (only active jobs: pending, processing)
  const activeJobs = data.filter(job => ['pending', 'processing'].includes(job.job_status));

  if (activeJobs.length === 0) {
    list.innerHTML = `<div style="color:var(--text-muted);font-size:14px;font-style:italic;">Queue is currently empty.</div>`;
    return;
  }

  list.innerHTML = activeJobs.map(job => {
    const isPrinting = job.job_status === 'processing';
    const borderClass = isPrinting ? 'cmyk-c' : 'cmyk-m';
    const badgeClass = isPrinting ? 'cyan' : 'magenta';
    const statusText = isPrinting ? 'PRINTING' : 'QUEUED';
    
    // Extract format from file url if available
    let formatText = 'PDF';
    if (job.file_url) {
      const parts = job.file_url.split('?')[0].split('.');
      if (parts.length > 1) {
        formatText = parts.pop().toUpperCase();
      }
    }
    
    const pagesText = job.pages ? `${job.pages} Page${job.pages > 1 ? 's' : ''}` : '1 Page';
    const copiesText = job.copies ? `${job.copies} Cop${job.copies > 1 ? 'ies' : 'y'}` : '1 Copy';
    
    return `
      <div class="job-card-custom ${borderClass}">
        <div class="job-info">
          <div class="job-name">#${job.job_number} - ${job.service_name || 'Document Print'}</div>
          <div class="job-meta">Format: ${formatText} • ${pagesText} • ${copiesText}</div>
        </div>
        <span class="badge-custom ${badgeClass}">${statusText}</span>
      </div>
    `;
  }).join('');
}

function subscribeQueue() {
  if (!supabaseClient) return;
  
  console.log('[PrintRUSH] Initializing Realtime channel for shop_id:', shopId);
  
  const channel = supabaseClient.channel('public:jobs')
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'jobs', 
      filter: `shop_id=eq.${shopId}` 
    }, (payload) => {
      console.log('[PrintRUSH] Realtime change detected:', payload);
      loadQueue();
    });

  channel.subscribe((status) => {
    console.log('[PrintRUSH] Realtime subscription status:', status);
    if (status === 'SUBSCRIBED') {
      console.log('[PrintRUSH] Realtime connection is active and listening for updates!');
    } else if (status === 'CLOSED') {
      console.log('[PrintRUSH] Realtime connection closed.');
    } else if (status === 'CHANNEL_ERROR') {
      console.error('[PrintRUSH] Realtime channel subscription error.');
    }
  });
}

async function createJob() {
  if (!currentFile || !supabaseClient) return;
  
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
  
  const { error } = await supabaseClient.from('jobs').insert([{
    shop_id: shopId,
    job_number: Math.floor(1000 + Math.random() * 9000),
    service_category: service,
    service_name: service === 'documents' ? 'Document Printing (B&W)' : service === 'photo' ? 'Photo Print (4R)' : 'Tarpaulin Printing',
    pages: pgs,
    copies: cps,
    payment_method: 'cash_pickup',
    payment_status: 'pending',
    job_status: 'pending',
    pickup_type: 'walkin',
    source: 'bluetooth',
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
