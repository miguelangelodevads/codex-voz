const $ = (id) => document.getElementById(id);
const log = $('log');

let sessao = null;
let reconhecimento = null;
let vozAtiva = false;
let falarAtivo = false;

const MODELOS = [
  ['anthropic/claude-sonnet-4-20250514', 'Claude Sonnet 4'],
  ['anthropic/claude-opus-4-20250514', 'Claude Opus 4'],
  ['openai/gpt-4.1', 'GPT-4.1'],
  ['google/gemini-2.5-pro', 'Gemini 2.5 Pro']
];

function preencherModelos() {
  const sel = $('modelo');
  MODELOS.forEach(([valor, nome]) => {
    const opt = document.createElement('option');
    opt.value = valor;
    opt.textContent = nome;
    sel.appendChild(opt);
  });
}

function vazioOuNao() {
  const vazio = log.querySelector('.vazio');
  if (vazio && log.children.length > 1) vazio.remove();
}

function adicionarMsg(papel, texto) {
  vazioOuNao();
  const div = document.createElement('div');
  div.className = 'msg ' + (papel === 'voce' ? 'voce' : 'agente');
  const p = document.createElement('span');
  p.className = 'papel';
  p.textContent = papel === 'voce' ? 'voce' : 'agente';
  const corpo = document.createElement('span');
  corpo.textContent = texto;
  div.append(p, corpo);
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return corpo;
}

function mostrarErro(texto) {
  $('erro').textContent = texto;
  setTimeout(() => { $('erro').textContent = ''; }, 8000);
}

async function api(caminho, opcoes = {}) {
  const r = await fetch('/api' + caminho, {
    headers: { 'content-type': 'application/json' },
    ...opcoes
  });
  const tipo = r.headers.get('content-type') || '';
  if (!tipo.includes('application/json')) return { _stream: r.body, status: r.status };
  const dados = await r.json();
  if (!r.ok) throw new Error(dados.error || JSON.stringify(dados));
  return dados;
}

async function novaSessao() {
  const dados = await api('/sessions', {
    method: 'POST',
    body: JSON.stringify({ title: 'Pelo celular' })
  });
  sessao = dados.id ?? dados.info?.id;
  log.textContent = '';
  adicionarEstadoVazio();
  adicionarMsg('sistema', 'Sessao nova criada: ' + sessao);
}

function adicionarEstadoVazio() {
  const div = document.createElement('div');
  div.className = 'vazio';
  div.textContent = 'Diga ou digite o que voce quer construir. O agente cria o projeto dentro do ambiente.';
  log.appendChild(div);
}

const rotuloFerramenta = {
  tool: 'ferramenta',
  step_start: 'passo',
  reasoning: 'raciocinio'
};

function renderizarPartes(container, parts) {
  for (const parte of parts) {
    if (parte.type === 'text' && parte.text) {
      const bloco = document.createElement('span');
      bloco.className = 'parte';
      bloco.textContent = parte.text;
      container.appendChild(bloco);
    } else if (parte.type === 'tool') {
      const bloco = document.createElement('span');
      bloco.className = 'ferramenta';
      bloco.textContent = `ferramenta: ${parte.tool}`;
      container.appendChild(bloco);
    }
  }
}

function falar(texto) {
  if (!falarAtivo || !('speechSynthesis' in window) || !texto) return;
  const fala = new SpeechSynthesisUtterance(texto.slice(0, 400));
  fala.lang = 'pt-BR';
  speechSynthesis.speak(fala);
}

async function enviar(texto) {
  texto = texto.trim();
  if (!texto || !sessao) return;
  adicionarMsg('voce', texto);
  $('texto').value = '';
  const corpo = adicionarMsg('agente', '');
  corpo.textContent = 'pensando...';

  const [providerID, ...resto] = $('modelo').value.split('/');
  const modelID = resto.join('/');

  try {
    const dados = await api(`/sessions/${sessao}/message`, {
      method: 'POST',
      body: JSON.stringify({
        parts: [{ type: 'text', text: texto }],
        providerID,
        modelID
      })
    });

    if (dados._stream) {
      corpo.textContent = '';
      const leitor = dados._stream.getReader();
      const decodificador = new TextDecoder();
      let acumulado = '';
      while (true) {
        const { done, value } = await leitor.read();
        if (done) break;
        acumulado += decodificador.decode(value, { stream: true });
        for (const linha of acumulado.split('\n\n')) {
          for (const l of linha.split('\n')) {
            if (!l.startsWith('data:')) continue;
            try {
              const evento = JSON.parse(l.slice(5).trim());
              if (evento.type === 'message.part.updated' && evento.part) {
                if (evento.part.type === 'text') {
                  corpo.textContent = evento.part.text || '';
                } else if (evento.part.type === 'tool') {
                  corpo.textContent = (corpo.dataset.txt || '') + `\nferramenta: ${evento.part.tool}`;
                  corpo.dataset.txt = evento.part.text || '';
                }
                log.scrollTop = log.scrollHeight;
              }
            } catch { /* linha parcial, ignora */ }
          }
        }
      }
      if (!corpo.textContent) corpo.textContent = '(sem resposta)';
      falar(corpo.textContent);
    } else {
      const info = dados.info ?? dados;
      const parts = info.parts || dados.parts || [];
      corpo.textContent = '';
      renderizarPartes(corpo, parts);
      if (!corpo.textContent) corpo.textContent = '(sem resposta)';
      const textoResposta = parts.filter((p) => p.type === 'text').map((p) => p.text).join(' ');
      falar(textoResposta);
    }
  } catch (e) {
    corpo.textContent = 'erro: ' + e.message;
    mostrarErro(e.message);
  }
}

function iniciarVoz() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    mostrarErro('Este navegador nao suporta reconhecimento de voz. Use Chrome ou Safari.');
    return;
  }
  reconhecimento = new SR();
  reconhecimento.lang = 'pt-BR';
  reconhecimento.continuous = true;
  reconhecimento.interimResults = false;

  reconhecimento.onresult = (e) => {
    const transcricao = Array.from(e.results)
      .slice(e.resultIndex)
      .map((r) => r[0].transcript)
      .join(' ');
    if (transcricao.trim()) enviar(transcricao);
  };
  reconhecimento.onerror = (e) => {
    if (e.error === 'not-allowed') {
      mostrarErro('Permissao de microfone negada.');
      pararVoz();
    }
  };
  reconhecimento.onend = () => {
    if (vozAtiva) { try { reconhecimento.start(); } catch { /* ja iniciado */ } }
  };
  try {
    reconhecimento.start();
    vozAtiva = true;
    $('mic').classList.add('ouvindo');
    $('mic').textContent = 'parar voz';
  } catch (e) {
    mostrarErro('Nao foi possivel iniciar o microfone: ' + e.message);
  }
}

function pararVoz() {
  vozAtiva = false;
  if (reconhecimento) reconhecimento.stop();
  $('mic').classList.remove('ouvindo');
  $('mic').textContent = 'falar';
  speechSynthesis?.cancel();
}

$('mic').addEventListener('click', () => (vozAtiva ? pararVoz() : iniciarVoz()));
$('vozToggle').addEventListener('change', (e) => {
  falarAtivo = e.target.checked;
  if (!falarAtivo) speechSynthesis?.cancel();
});
$('nova').addEventListener('click', () => novaSessao().catch((e) => mostrarErro(e.message)));
$('voltar').addEventListener('click', () => {
  window.open('/?folder=/home/coder/projects', '_blank');
});

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!sessao) {
    novaSessao()
      .then(() => enviar($('texto').value))
      .catch((err) => mostrarErro(err.message));
    return;
  }
  enviar($('texto').value);
});

preencherModelos();
adicionarEstadoVazio();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
