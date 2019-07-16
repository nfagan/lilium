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
    const img = document.createElement('img');
    img.onload = evt => {
      window.URL.revokeObjectURL(img.src);
      resolve(img);
    }
    img.onerror = err => reject(err);
    img.src = url;
  });
}

export async function loadAudioBuffer(audioContext: AudioContext, url: string): Promise<AudioBufferSourceNode> {
  return new Promise<AudioBufferSourceNode>((resolve, reject) => {
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

    req.onerror = req => reject(req);
    req.open('GET', url, true);
    req.send();
  });
}

export async function loadUint8Buffer(url: string): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.responseType = 'arraybuffer';

    req.onload = () => {
      const buffer = req.response;
      const view = new DataView(buffer);
      const byteLength = buffer.byteLength;
      const array = new Uint8Array(byteLength);

      for (let i = 0; i < byteLength; i++) {
        array[i] = view.getUint8(i);
      }

      resolve(array);
    };

    req.onerror = req => reject(req);
    req.open('GET', url, true);
    req.send();
  });
}

export async function loadFloat32Buffer(url: string, isLittleEndian: boolean = true): Promise<Float32Array> {
  return new Promise<Float32Array>((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.responseType = 'arraybuffer';

    req.onload = () => {
      const buffer = req.response;
      const view = new DataView(buffer);

      const byteLength = buffer.byteLength;
      const destLength = Math.floor(byteLength / 4);

      if (byteLength % 4 !== 0) {
        console.warn('Improper number of bytes for Float32Array.');
      }

      const array = new Float32Array(destLength);

      for (let i = 0; i < destLength; i++) {
        array[i] = view.getFloat32(i*4, isLittleEndian);
      }

      resolve(array);
    };

    req.onerror = req => reject(req);
    req.open('GET', url, true);
    req.send();
  });
}