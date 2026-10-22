import * as THREE from 'three';

/**
 * CEU DE FUNDO em alta resolucao (somente o "papel de parede" visivel).
 * ---------------------------------------------------------------------------
 * A iluminacao continua vindo do HDR 2k (public/env/ceu_parcialmente_nublado_2k.hdr), que
 * guarda a energia real do sol e do ceu. O HDR 2k, porem, fica borrado como fundo: cada pixel
 * cobre ~0,18 grau. Aqui carregamos a versao LDR (JPG "tonemapped" oficial) do MESMO HDRI da
 * Poly Haven — kloofendal_48d_partly_cloudy_puresky — em 8k ou 4k. Como e o mesmo ceu, a
 * posicao do sol e das nuvens coincide com a luz e os reflexos.
 *
 * Abaixo do horizonte o "puresky" espelhava as nuvens; o pipeline (pipeline/texturas.py)
 * trocou essa metade por uma nevoa neutra de horizonte, para a vista aerea nao mostrar reflexos.
 *
 * Observacao: texturas sRGB de fundo nao passam pelo tone mapping do three (WebGLBackground),
 * entao a foto aparece com a exposicao com que foi publicada; scene.backgroundIntensity continua
 * valendo para escurecer ao entardecer/noite.
 */
export async function loadSkyBackground(base: string, maxTex: number): Promise<THREE.Texture | null> {
  const file = maxTex >= 8192 ? 'ceu_fundo_8k.webp' : 'ceu_fundo_4k.webp';
  try {
    const tex = await new THREE.TextureLoader().loadAsync(base + 'env/' + file);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    // fundo nao precisa de mipmaps (sempre visto ~1:1); economiza 33% de memoria de video
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  } catch (err) {
    console.warn('ceu de fundo em alta resolucao indisponivel', err);
    return null;
  }
}
