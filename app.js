(() => {
  const $ = id => document.getElementById(id);
  const views = ['setupView','authView','chatView'];
  let client = null, channel = null, mode = 'login', currentUser = null;
  const configKey = 'minimal_chat_supabase_config_v1';
  const nameKey = 'minimal_chat_display_name_v1';

  function show(id){ views.forEach(v => $(v).classList.toggle('hidden', v !== id)); $('signOutBtn').classList.toggle('hidden', id !== 'chatView'); }
  function msg(id,text,ok=false){ const el=$(id); el.textContent=text||''; el.style.color=ok?'#16794c':''; }
  function getConfig(){ try{return JSON.parse(localStorage.getItem(configKey))}catch{return null} }
  function validConfig(c){ return c && /^https:\/\/.+\.supabase\.co\/?$/.test(c.url) && c.key && c.key.length>20; }
  function connect(c){ client = window.supabase.createClient(c.url.replace(/\/$/,''), c.key); }
  function safeName(){ return (localStorage.getItem(nameKey)||currentUser?.email?.split('@')[0]||'ユーザー').slice(0,30); }
  function formatTime(s){ return new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(s)); }

  function renderMessage(m){
    if ($('messages').querySelector(`[data-id="${m.id}"]`)) return;
    const row=document.createElement('li'); row.className='bubble-row'+(m.user_id===currentUser.id?' mine':''); row.dataset.id=m.id;
    const meta=document.createElement('div'); meta.className='meta'; meta.textContent=`${m.sender_name} · ${formatTime(m.created_at)}`;
    const bubble=document.createElement('div'); bubble.className='bubble'; bubble.textContent=m.content;
    row.append(meta,bubble); $('messages').append(row); $('messages').scrollTop=$('messages').scrollHeight;
  }

  async function loadChat(){
    show('chatView'); $('userLabel').textContent=safeName(); $('messages').replaceChildren(); msg('chatMessage','読み込み中…');
    const {data,error}=await client.from('messages').select('*').order('created_at',{ascending:true}).limit(100);
    if(error){ msg('chatMessage','読み込みに失敗しました: '+error.message); return; }
    data.forEach(renderMessage); msg('chatMessage','');
    if(channel) await client.removeChannel(channel);
    channel=client.channel('public:messages').on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},p=>renderMessage(p.new)).subscribe(status=>{
      if(status==='CHANNEL_ERROR') msg('chatMessage','リアルタイム接続に失敗しました。Supabaseの設定を確認してください。');
    });
  }

  async function afterConnect(){
    const {data:{session}}=await client.auth.getSession();
    if(session){ currentUser=session.user; await loadChat(); } else show('authView');
    client.auth.onAuthStateChange(async (_event,session)=>{ if(session){currentUser=session.user; await loadChat()} else {currentUser=null; show('authView')} });
  }

  $('setupForm').addEventListener('submit',async e=>{
    e.preventDefault(); const c={url:$('projectUrl').value.trim(),key:$('anonKey').value.trim()};
    if(!validConfig(c)){alert('URLまたはキーの形式を確認してください。');return}
    localStorage.setItem(configKey,JSON.stringify(c)); connect(c); await afterConnect();
  });
  $('clearConfigBtn').addEventListener('click',()=>{ localStorage.removeItem(configKey); location.reload(); });
  $('showSetupBtn').addEventListener('click',()=>{ const c=getConfig(); $('projectUrl').value=c?.url||''; $('anonKey').value=c?.key||''; show('setupView'); });

  function setMode(next){ mode=next; const signup=mode==='signup'; $('loginTab').classList.toggle('active',!signup); $('signupTab').classList.toggle('active',signup); $('nameLabel').classList.toggle('hidden',!signup); $('displayName').required=signup; $('authSubmit').textContent=signup?'新規登録':'ログイン'; msg('authMessage',''); }
  $('loginTab').addEventListener('click',()=>setMode('login')); $('signupTab').addEventListener('click',()=>setMode('signup'));
  $('authForm').addEventListener('submit',async e=>{
    e.preventDefault(); msg('authMessage','処理中…'); $('authSubmit').disabled=true;
    const email=$('email').value.trim(), password=$('password').value;
    let result;
    if(mode==='signup'){
      localStorage.setItem(nameKey,$('displayName').value.trim());
      result=await client.auth.signUp({email,password});
      if(!result.error && !result.data.session) msg('authMessage','確認メールを送りました。メール内のリンクを開いてからログインしてください。',true);
    } else result=await client.auth.signInWithPassword({email,password});
    if(result.error) msg('authMessage','エラー: '+result.error.message);
    $('authSubmit').disabled=false;
  });
  $('signOutBtn').addEventListener('click',async()=>{ if(channel) await client.removeChannel(channel); await client.auth.signOut(); });
  $('messageForm').addEventListener('submit',async e=>{
    e.preventDefault(); const content=$('messageInput').value.trim(); if(!content)return;
    $('messageForm').querySelector('button').disabled=true;
    const {error}=await client.from('messages').insert({user_id:currentUser.id,sender_name:safeName(),content});
    if(error) msg('chatMessage','送信できませんでした: '+error.message); else {$('messageInput').value=''; msg('chatMessage','')}
    $('messageForm').querySelector('button').disabled=false; $('messageInput').focus();
  });

  const c=getConfig(); if(validConfig(c)){connect(c); afterConnect().catch(e=>{show('setupView');alert('接続に失敗しました: '+e.message)})} else show('setupView');
})();