// All effects are synthesized locally; create/resume audio only from a user gesture.
export function createSound(){
  let context=null,master=null,noise=null;
  const active=new Set();
  const stats={nearMisses:0,records:0,impacts:0};
  function unlock(){
    try{
      const Audio=globalThis.AudioContext??globalThis.webkitAudioContext;
      if(!Audio)return;
      if(!context){
        context=new Audio({latencyHint:'interactive'});master=context.createGain();
        master.gain.value=.35;master.connect(context.destination);
        noise=context.createBuffer(1,Math.ceil(context.sampleRate*.35),context.sampleRate);
        const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      }
      if(context.state!=='running')context.resume().catch(()=>{});
    }catch{/* Audio unavailable: gameplay continues silently. */}
  }
  function voice(source,duration,peak,frequency,pan=0){
    if(context?.state!=='running')return;
    const gain=context.createGain(),filter=context.createBiquadFilter();
    filter.type=source.buffer?'bandpass':'lowpass';filter.frequency.value=frequency;filter.Q.value=.6;
    const now=context.currentTime;gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(peak,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    source.connect(filter);filter.connect(gain);
    let panner;
    if(context.createStereoPanner){panner=context.createStereoPanner();panner.pan.value=Math.max(-.6,Math.min(.6,pan));gain.connect(panner);panner.connect(master);}else gain.connect(master);
    active.add(source);source.onended=()=>{active.delete(source);source.disconnect();filter.disconnect();gain.disconnect();panner?.disconnect();};
    source.start(now);source.stop(now+duration+.01);
  }
  function tone(from,to,duration,peak){
    if(context?.state!=='running')return;
    const source=context.createOscillator();source.type='sine';
    source.frequency.setValueAtTime(from,context.currentTime);source.frequency.exponentialRampToValueAtTime(to,context.currentTime+duration);
    voice(source,duration,peak,1600);
  }
  function silence(){for(const source of active){try{source.stop();}catch{}}}
  return {
    unlock,silence,
    near(type,pan){
      if(context?.state!=='running')return;stats.nearMisses++;
      const source=context.createBufferSource();source.buffer=noise;
      voice(source,type==='pit'?.10:.13,.12,type==='pit'?750:1600,pan*.45);
    },
    record(){stats.records++;tone(660,880,.22,.055);},
    impact(type){stats.impacts++;if(type==='box')tone(105,48,.17,.14);else tone(280,85,.25,.045);},
    reset(){silence();stats.nearMisses=0;stats.records=0;stats.impacts=0;},
    snapshot:()=>({...stats,state:context?.state??'uninitialized',active:active.size}),
  };
}
