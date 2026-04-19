const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = 3333;

app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static(path.join(__dirname,'downloads')));

//////////////////////////////////////////////////////////
// ⚙️ CONFIG
//////////////////////////////////////////////////////////
const RANDOM_MODE = true; // 🔥 TOGGLE THIS

const DEFAULT_DELAY = 100;
const DEFAULT_SLOTS = 3;

const foreverJobs = new Map();

//////////////////////////////////////////////////////////
// 🔥 INFO (STABLE THUMBNAILS)
//////////////////////////////////////////////////////////
app.post('/info',(req,res)=>{
  const { url } = req.body;

  const ytdlp = spawn('yt-dlp',[
    url,
    '--dump-single-json',
    '--no-warnings',
    '--no-playlist',
    '--js-runtimes','node'
  ]);

  let data = '';

  ytdlp.stdout.on('data',chunk=> data += chunk.toString());

  ytdlp.on('close',()=>{
    try{
      const json = JSON.parse(data);
      res.json({
        title: json.title || 'Unknown',
        thumbnail: json.thumbnail || '',
        duration: json.duration || 0
      });
    }catch{
      res.status(500).json({error:'Invalid video'});
    }
  });
});

//////////////////////////////////////////////////////////
// 🎲 RANDOM HELPERS
//////////////////////////////////////////////////////////
function getRandomDelay(){
  if(!RANDOM_MODE) return DEFAULT_DELAY;
  return Math.floor(Math.random() * (5000 - 1000 + 1)) + 1000;
}

function getMaxSlots(){
  if(!RANDOM_MODE) return DEFAULT_SLOTS;
  return Math.floor(Math.random() * (9 - 3 + 1)) + 3;
}

//////////////////////////////////////////////////////////
// 🔁 FOREVER LOOP
//////////////////////////////////////////////////////////
function runConvertLoop({url, bitrate, jobId}){

  if(!foreverJobs.has(jobId)){
    console.log("🛑 LOOP STOPPED:", jobId);
    return;
  }

  const job = foreverJobs.get(jobId);

  let { slot, maxSlots } = job;

  const waitTime = getRandomDelay();

  console.log("\n♾️ LOOP RUNNING");
  console.log("🎲 RANDOM MODE:", RANDOM_MODE);
  console.log("🧩 SLOT:", slot, "/", maxSlots);
  console.log("⏱ WAIT:", waitTime, "ms");
  console.log("♻️ OVERWRITE MODE ACTIVE");

  const freshUrl = url.includes('?')
    ? url + '&t=' + Date.now()
    : url + '?t=' + Date.now();

  const output = path.join(
    __dirname,
    'downloads',
    `%(title)s_${slot}.%(ext)s`
  );

  const ytdlp = spawn('yt-dlp',[
    freshUrl,
    '--extract-audio',
    '--audio-format','mp3',
    '--audio-quality', bitrate || '192K',

    '--no-cache-dir',
    '--no-playlist',
    '--no-continue',
    '--force-overwrites',

    '--js-runtimes','node',
    '--output', output,
    '--restrict-filenames'
  ]);

  let filename = null;

  ytdlp.stdout.on('data',(d)=>{
    const line = d.toString();
    console.log(line.trim());

    const match = line.match(/Destination:\s*(.*)/);
    if(match){
      filename = path.basename(match[1]);
    }
  });

  ytdlp.stderr.on('data',(d)=>{
    console.log("⚠️", d.toString());
  });

  ytdlp.on('close',(code)=>{

    if(code === 0){
      console.log("✅ SUCCESS:", filename);
    } else {
      console.log("❌ FAILED (retrying anyway)");
    }

    // 🔁 NEXT SLOT
    let nextSlot = slot + 1;
    if(nextSlot > maxSlots) nextSlot = 1;

    // 🎲 RANDOMIZE SLOT COUNT EACH LOOP IF ENABLED
    const newMaxSlots = getMaxSlots();

    foreverJobs.set(jobId,{
      slot: nextSlot,
      maxSlots: newMaxSlots
    });

    console.log("🔁 NEXT SLOT:", nextSlot, "/", newMaxSlots);

    setTimeout(()=>{
      runConvertLoop({ url, bitrate, jobId });
    }, waitTime);
  });
}

//////////////////////////////////////////////////////////
// 🔥 CONVERT ROUTE
//////////////////////////////////////////////////////////
app.post('/convert',(req,res)=>{
  const { url, bitrate, forever } = req.body;

  if(!url || !url.startsWith('http')){
    return res.status(400).json({error:'invalid_url'});
  }

  if(forever){

    const jobId = Date.now().toString();

    const initialSlots = getMaxSlots();

    foreverJobs.set(jobId,{
      slot: 1,
      maxSlots: initialSlots
    });

    console.log("\n♾️ FOREVER MODE STARTED:", jobId);
    console.log("🎲 INITIAL MAX SLOTS:", initialSlots);

    setTimeout(()=>{
      runConvertLoop({ url, bitrate, jobId });
    }, 1000);

    return res.json({
      status:'forever_started',
      jobId
    });
  }

  // NORMAL MODE
  const output = path.join(__dirname,'downloads','%(title)s.%(ext)s');

  const ytdlp = spawn('yt-dlp',[
    url,
    '--extract-audio',
    '--audio-format','mp3',
    '--audio-quality', bitrate || '192K',
    '--force-overwrites',
    '--js-runtimes','node',
    '--output', output,
    '--restrict-filenames'
  ]);

  let filename = null;

  ytdlp.stdout.on('data',(d)=>{
    const line = d.toString();

    const match = line.match(/Destination:\s*(.*)/);
    if(match){
      filename = path.basename(match[1]);
    }

    console.log(line);
  });

  ytdlp.on('close',(code)=>{
    if(code===0){
      res.json({
        filePath:`/downloads/${filename}`,
        fileName: filename
      });
    }else{
      res.status(500).json({error:'fail'});
    }
  });
});

app.listen(PORT,()=>{
  console.log("Running http://localhost:"+PORT);
});
