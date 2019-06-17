export async function loadText(url: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          resolve(xhr.responseText);
        } else {
          reject(xhr);
        }
      }
    }

    xhr.open('GET', url);
    xhr.send();
  });
}

export async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    let img = document.createElement('img');
    img.onload = evt => {
      window.URL.revokeObjectURL(img.src);
      resolve(img);
    }
    img.onerror = err => reject(err);
    img.src = url;
  });
}

export async function loadAudioBuffer(audioContext: AudioContext, url: string): Promise<AudioBufferSourceNode> {
  return new Promise((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.responseType = 'arraybuffer';

    req.onload = () => {
      const audioData = req.response;
      audioContext.decodeAudioData(audioData, buffer => {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        resolve(source);
      }, err => reject(err));
    };

    req.open('GET', url, true);
    req.send();
  });
}