import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import * as maplibregl from "maplibre-gl";
import mapStyle from "./mapStyle.json";

// o worker do MapLibre importa um chunk interno ("maplibre-gl-shared.mjs") que o
// Vite não empacota quando o arquivo é copiado como asset cru — o worker falhava
// ao carregar e nenhuma rua/rótulo aparecia. Por isso usamos uma cópia pré-empacotada
// (tudo em um arquivo só, sem imports externos) publicada em /public.
maplibregl.setWorkerUrl("/maplibre-gl-worker.js");
import { getKV, setKV, subscribeKV, uploadArquivo } from "./lib/storage";
import {
  Bike,
  Wallet,
  LayoutDashboard,
  Users,
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Wrench,
  Trash2,
  Pencil,
  FileText,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  MapPin,
  Settings,
  Image as ImageIcon,
  Navigation,
  Crosshair,
  Route,
  RefreshCw,
  ExternalLink,
  Eye,
  EyeOff,
  Undo2,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Bar,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

/* ===========================================================
   THEME — verde floresta (fundo), mint (marca), âmbar/coral (sinalização)
   inspirado diretamente na identidade visual da mobi relli
=========================================================== */
const DEFAULT_THEME = {
  bg: "#0E2116",
  mint: "#2FA666",
  amber: "#C9A24B",
  coral: "#D9694F",
  blue: "#6FA8D8",
};

// objeto mutável — lido "ao vivo" por todos os componentes a cada renderização,
// então recalculá-lo em buildTheme()/Object.assign no topo do App já repinta tudo
const theme = {
  ...DEFAULT_THEME,
  panel: "#152D1F",
  card: "#183524",
  card2: "#1E3F2A",
  cardBorder: "#2C4D38",
  mintText: "#0E2116",
  sage: "#6FA087",
  text: "#EDF5EF",
  textMuted: "#8AA894",
};

const clamp255 = (n) => Math.min(255, Math.max(0, n));
const hexToRgb = (hex) => {
  const h = (hex || "#000000").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const rgbToHex = ({ r, g, b }) =>
  "#" + [r, g, b].map((v) => clamp255(Math.round(v)).toString(16).padStart(2, "0")).join("");
const hexToRgba = (hex, alpha) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
const mixColors = (hexA, hexB, t) => {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
};
const luminance = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
const contrastText = (hex) => (luminance(hex) > 0.6 ? "#0E2116" : "#EDF5EF");

function buildTheme(config) {
  const bg = (config && config.bg) || DEFAULT_THEME.bg;
  const accent = (config && config.accent) || DEFAULT_THEME.amber;
  const brand = (config && config.brand) || DEFAULT_THEME.mint;
  const coral = (config && config.coral) || DEFAULT_THEME.coral;
  const blue = (config && config.blue) || DEFAULT_THEME.blue;
  const text = contrastText(bg);
  return {
    bg,
    panel: mixColors(bg, text, 0.07),
    card: mixColors(bg, text, 0.09),
    card2: mixColors(bg, text, 0.14),
    cardBorder: mixColors(bg, text, 0.26),
    text,
    textMuted: mixColors(bg, text, 0.55),
    mint: brand,
    mintText: contrastText(brand),
    sage: mixColors(brand, bg, 0.45),
    amber: accent,
    coral,
    blue,
  };
}

const HEAD_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Poppins', system-ui, sans-serif";
const BODY_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif";

const fontImport = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
`;

/* ===========================================================
   HELPERS
=========================================================== */
const uid = () => Math.random().toString(36).slice(2, 10);

// o Storage do Supabase rejeita chaves com acento (ex: "Joao" com til, "contracao" com
// cedilha) com erro "InvalidKey" — o upload falha silenciosamente. Isso troca só o NOME
// usado no caminho de armazenamento por uma versão sem acento; o nome original mostrado
// pro usuário não muda.
const DIACRITICOS = new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g");
const nomeArquivoSeguro = (nome) => (nome || "arquivo").normalize("NFD").replace(DIACRITICOS, "");

const formatCurrency = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatCompact = (v) => {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1000) return `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}mil`;
  return `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};

const formatDate = (d) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

// máscaras — sempre a partir dos dígitos puros, refeitas a cada tecla (não acumulam erro)
const maskCpfCnpj = (v) => {
  const d = (v || "").replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};

const maskTelefone = (v) => {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
};

const maskCep = (v) => (v || "").replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d{1,3})$/, "$1-$2");

// placa fica guardada sem traço (bate com o nome do dispositivo na Melocaliza e com o texto
// digitado no fluxo de caixa) — o traço é só visual, aplicado sempre na hora de mostrar/digitar
const placaLimpa = (v) => (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
const formatPlaca = (v) => {
  const d = placaLimpa(v);
  return d.length <= 3 ? d : `${d.slice(0, 3)}-${d.slice(3)}`;
};

// liga lançamentos de entrada à moto pela placa (categoria/descrição), tipo "Mensalidade URB5I50" —
// é assim que o fluxo de caixa já é lançado, então usamos isso pra saber o que essa moto já recebeu de verdade
function pagamentosDaMoto(moto, lancamentos) {
  const p = (moto?.placa || "").toUpperCase().trim();
  if (!moto) return [];
  return (lancamentos || [])
    .filter(
      (l) =>
        l.tipo === "entrada" &&
        (l.motoId === moto.id || (p && !l.motoId && `${l.categoria || ""} ${l.descricao || ""}`.toUpperCase().includes(p)))
    )
    .sort((a, b) => (a.data < b.data ? 1 : -1));
}

// custos da moto — junta os registros manuais (custosExtras) com as saídas do fluxo
// de caixa que foram vinculadas a essa moto (ex: despachante lançado direto no Caixa)
function custosDaMoto(moto, lancamentos) {
  if (!moto) return [];
  const manuais = (moto.custosExtras || []).map((c) => ({
    id: c.id,
    data: c.data,
    descricao: c.descricao || "Sem descrição",
    valorGasto: c.valorGasto,
  }));
  const doCaixa = (lancamentos || [])
    .filter((l) => l.tipo === "saida" && l.motoId === moto.id)
    .map((l) => ({
      id: l.id,
      data: l.data,
      descricao: l.descricao || l.categoria || "Sem descrição",
      valorGasto: l.valor,
    }));
  return [...manuais, ...doCaixa].sort((a, b) => (a.data < b.data ? 1 : -1));
}

// projeta os próximos `meses` meses (a partir do mês atual) somando as contas futuras —
// as recorrentes (ex: contabilidade, aluguel de uma moto fixo) contam em todo mês a partir
// do vencimento cadastrado, as avulsas (ex: imposto de renda) só contam no mês do próprio
// vencimento. Entradas e saídas são somadas separadamente pra dar o saldo previsto do mês.
function projecaoFuturosPorMes(futuros, meses = 12) {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const resultado = [];
  for (let i = 0; i < meses; i++) {
    const d = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    let entrada = 0;
    let saida = 0;
    (futuros || []).forEach((f) => {
      if (!f.vencimento) return;
      const vd = new Date(`${f.vencimento}T00:00:00`);
      const valor = Number(f.valor) || 0;
      const conta = f.tipo === "entrada" ? (v) => (entrada += v) : (v) => (saida += v);
      if (f.recorrente) {
        const inicioRecorrencia = new Date(vd.getFullYear(), vd.getMonth(), 1);
        const fimRecorrencia = f.dataTermino ? new Date(`${f.dataTermino}T00:00:00`) : null;
        if (d >= inicioRecorrencia && (!fimRecorrencia || d <= fimRecorrencia)) conta(valor);
      } else if (!f.pago && f.vencimento.slice(0, 7) === key) {
        conta(valor);
      }
    });
    resultado.push({ key, mes: monthLabel(key), entrada, saida, saldo: entrada - saida });
  }
  return resultado;
}

// representa os contratos de aluguel ativos como se fossem "futuros" recorrentes —
// assim a mensalidade de cada moto alugada entra automaticamente na previsão de
// Futuros, sem precisar cadastrar de novo. Usa a data de término do contrato (se
// tiver sido preenchida) como limite; sem data, entra como indefinido.
function contratosComoFuturos(motos) {
  return (motos || [])
    .filter((m) => m.contratoAtual && Number(m.contratoAtual.valorMensal) > 0)
    .map((m) => ({
      id: `contrato-${m.contratoAtual.id}`,
      tipo: "entrada",
      descricao: `Mensalidade ${formatPlaca(m.placa)}`,
      categoria: "Contrato ativo",
      valor: Number(m.contratoAtual.valorMensal) || 0,
      vencimento: m.contratoAtual.dataInicio || todayISO(),
      diaVencimento: diaVencimentoDoContrato(m.contratoAtual),
      dataTermino: m.contratoAtual.dataTermino || "",
      recorrente: true,
      pago: false,
      motoId: m.id,
      origemContrato: true,
    }));
}

function totaisFuturos(futuros, motos) {
  const todos = [...(futuros || []), ...contratosComoFuturos(motos)];
  const recorrentes = todos.filter((f) => f.recorrente);
  const fixoMensalSaida = recorrentes.filter((f) => f.tipo !== "entrada").reduce((s, f) => s + (Number(f.valor) || 0), 0);
  const fixoMensalEntrada = recorrentes.filter((f) => f.tipo === "entrada").reduce((s, f) => s + (Number(f.valor) || 0), 0);
  const avulsosPendentes = todos.filter((f) => !f.recorrente && !f.pago);
  const avulsosPendentesSaida = avulsosPendentes.filter((f) => f.tipo !== "entrada").reduce((s, f) => s + (Number(f.valor) || 0), 0);
  const avulsosPendentesEntrada = avulsosPendentes.filter((f) => f.tipo === "entrada").reduce((s, f) => s + (Number(f.valor) || 0), 0);
  const projecao = projecaoFuturosPorMes(todos, 12);
  const previstoSaida12Meses = projecao.reduce((s, m) => s + m.saida, 0);
  const previstoEntrada12Meses = projecao.reduce((s, m) => s + m.entrada, 0);
  return {
    fixoMensalSaida,
    fixoMensalEntrada,
    avulsosPendentesSaida,
    avulsosPendentesEntrada,
    previstoSaida12Meses,
    previstoEntrada12Meses,
    saldoPrevisto12Meses: previstoEntrada12Meses - previstoSaida12Meses,
  };
}

// quanto está previsto entrar/sair nos próximos `dias` dias — pra ver rapidinho o que
// vence essa semana, sem precisar abrir o mês inteiro em "Futuros". Também devolve item
// a item (moto/categoria) pra dar pra mostrar "de onde vem" ao passar o mouse
function futurosProximosDias(futuros, motos, dias = 7) {
  const todos = [...(futuros || []), ...contratosComoFuturos(motos)];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + dias);
  let entrada = 0;
  let saida = 0;
  const itensEntrada = new Map();
  const itensSaida = new Map();

  const rotulo = (f) => {
    const moto = motos?.find((m) => m.id === f.motoId);
    const base = f.descricao || f.categoria || "Item";
    if (!moto) return base;
    const placa = formatPlaca(moto.placa);
    return base.includes(placa) ? base : `${base} (${placa})`;
  };

  todos.forEach((f) => {
    if (!f.vencimento) return;
    const valor = Number(f.valor) || 0;
    const itens = f.tipo === "entrada" ? itensEntrada : itensSaida;
    const soma = (v) => {
      if (f.tipo === "entrada") entrada += v;
      else saida += v;
      const label = rotulo(f);
      itens.set(label, (itens.get(label) || 0) + v);
    };
    if (f.recorrente) {
      const diaVenc = f.diaVencimento ? Number(f.diaVencimento) : new Date(`${f.vencimento}T00:00:00`).getDate();
      const fimRecorrencia = f.dataTermino ? new Date(`${f.dataTermino}T00:00:00`) : null;
      // olha esse mês e o próximo, pra cobrir vencimento que cai virando o mês
      for (let i = 0; i < 2; i++) {
        const candidato = new Date(hoje.getFullYear(), hoje.getMonth() + i, diaVenc);
        if (candidato >= hoje && candidato <= limite && (!fimRecorrencia || candidato <= fimRecorrencia)) {
          soma(valor);
          break;
        }
      }
    } else if (!f.pago) {
      const vd = new Date(`${f.vencimento}T00:00:00`);
      if (vd >= hoje && vd <= limite) soma(valor);
    }
  });

  const paraLista = (mapa) => [...mapa.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
  return { entrada, saida, itensEntrada: paraLista(itensEntrada), itensSaida: paraLista(itensSaida) };
}

// consulta o CEP no ViaCEP (serviço público, gratuito, sem chave) e devolve o endereço
// pra preencher os campos sozinho — só chama quando o CEP tem os 8 dígitos
async function buscarEnderecoPorCEP(cep) {
  const digits = (cep || "").replace(/\D/g, "");
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const data = await res.json();
    if (!res.ok || data.erro) return null;
    return {
      logradouro: data.logradouro || "",
      bairro: data.bairro || "",
      cidade: data.localidade || "",
      estado: data.uf || "",
    };
  } catch {
    return null;
  }
}

const isOverdue = (dateStr) => {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + "T00:00:00") < today;
};

// dia do mês em que o cliente paga a mensalidade — contratos antigos guardavam uma
// data completa (dataVencimento), então aproveita o dia dela se o campo novo (diaVencimento)
// ainda não tiver sido preenchido
function diaVencimentoDoContrato(contrato) {
  if (!contrato) return null;
  if (contrato.diaVencimento) return Number(contrato.diaVencimento);
  if (contrato.dataVencimento) return Number(contrato.dataVencimento.slice(8, 10));
  return null;
}

// vencido = já passou o dia de pagamento deste mês
const isContratoVencido = (contrato) => {
  const dia = diaVencimentoDoContrato(contrato);
  if (!dia) return false;
  const hoje = new Date();
  const hojeZero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const vencimentoDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
  return hojeZero > vencimentoDoMes;
};

const monthLabel = (key) => {
  const [y, m] = key.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[Number(m) - 1]}/${y.slice(2)}`;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const enderecoCompleto = (c) => {
  let logradouroNumero = c.logradouro && c.numero ? `${c.logradouro}, ${c.numero}` : c.logradouro;
  if (logradouroNumero && c.complemento) logradouroNumero += ` - ${c.complemento}`;
  return (
    [logradouroNumero, c.bairro, c.cidade && c.estado ? `${c.cidade}/${c.estado}` : c.cidade].filter(Boolean).join(" — ") ||
    "Endereço não informado"
  );
};

/* ===========================================================
   STORAGE — dados compartilhados (você + seu pai, mesmo link)
=========================================================== */
function useSharedList(key) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const val = await getKV(key);
        if (!cancelled) setItems(val || []);
      } catch {
        if (!cancelled) setError("Não foi possível carregar os dados agora.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    // atualiza sozinho quando outra pessoa (ex. seu pai) mexe nos dados em outro aparelho
    const unsubscribe = subscribeKV(key, (val) => setItems(val || []));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [key]);

  const persist = useCallback(
    async (next) => {
      setItems(next);
      try {
        const ok = await setKV(key, next);
        setError(ok ? null : "Não foi possível salvar agora. Tente novamente.");
        return ok;
      } catch {
        setError("Não foi possível salvar agora. Tente novamente.");
        return false;
      }
    },
    [key]
  );

  return { items, persist, loading, error };
}

function useSharedObject(key, defaultValue) {
  const [value, setValue] = useState(defaultValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const val = await getKV(key);
        if (!cancelled) setValue(val || defaultValue);
      } catch {
        if (!cancelled) setError("Não foi possível carregar os dados agora.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const unsubscribe = subscribeKV(key, (val) => setValue(val || defaultValue));
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const persist = useCallback(
    async (next) => {
      setValue(next);
      try {
        const ok = await setKV(key, next);
        setError(ok ? null : "Não foi possível salvar agora. Tente novamente.");
        return ok;
      } catch {
        setError("Não foi possível salvar agora. Tente novamente.");
        return false;
      }
    },
    [key]
  );

  return { value, persist, loading, error };
}

/* ===========================================================
   UI ATOMS
=========================================================== */
function Wordmark({ compact, logoDataUrl, logoSize }) {
  const [erro, setErro] = useState(false);
  const src = logoDataUrl || "/logo-header.png";
  if (!erro) {
    const height = logoSize || (compact ? 28 : 38);
    return (
      <img
        src={src}
        alt="Mobirelli"
        style={{ height, width: "auto", maxWidth: "60vw", objectFit: "contain", display: "block" }}
        onError={() => setErro(true)}
      />
    );
  }
  return <WordmarkFallback compact={compact} />;
}

function WordmarkFallback({ compact }) {
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
      <div className="flex items-center gap-1.5">
        <span style={{ fontFamily: HEAD_FONT, fontWeight: 500, fontSize: compact ? 20 : 26, color: theme.mint }}>mobi</span>
        <span
          style={{
            fontFamily: HEAD_FONT,
            fontWeight: 700,
            fontSize: compact ? 20 : 26,
            color: theme.mintText,
            background: theme.mint,
            borderRadius: 8,
            padding: "1px 10px",
          }}
        >
          relli
        </span>
      </div>
      {!compact && (
        <div className="flex items-center gap-1.5 ml-1">
          <div style={{ width: 12, height: 9, borderLeft: `2px solid ${theme.sage}`, borderBottom: `2px solid ${theme.sage}`, borderBottomLeftRadius: 5 }} />
          <span
            style={{
              fontFamily: BODY_FONT,
              fontSize: 10.5,
              fontWeight: 700,
              color: theme.mintText,
              background: theme.mint,
              borderRadius: 6,
              padding: "1px 7px",
              letterSpacing: 0.2,
            }}
          >
            aluguel de motos
          </span>
        </div>
      )}
    </div>
  );
}

function MotoPlate({ placa, size = "normal" }) {
  const grande = size === "grande";
  return (
    <div
      style={{
        background: theme.bg,
        border: `${grande ? 3 : 2}px solid ${theme.amber}`,
        borderRadius: grande ? 9 : 6,
        padding: grande ? "6px 14px" : "3px 9px",
        display: "inline-flex",
        alignItems: "center",
        gap: grande ? 9 : 6,
      }}
    >
      <div style={{ width: grande ? 9 : 6, height: grande ? 22 : 14, background: theme.blue, borderRadius: 2 }} />
      <span
        style={{
          fontFamily: "monospace",
          fontWeight: 700,
          letterSpacing: grande ? 2 : 1.5,
          fontSize: grande ? 22 : 14,
          color: theme.text,
        }}
      >
        {placa ? formatPlaca(placa) : "SEM PLACA"}
      </span>
    </div>
  );
}

const MOTO_STATUS = {
  disponivel: { label: "Disponível", color: theme.mint, dark: true, icon: CheckCircle2 },
  alugada: { label: "Alugada", color: theme.amber, dark: true, icon: Bike },
  preparacao: { label: "Em preparação", color: theme.sage, dark: true, icon: Clock },
  manutencao: { label: "Em manutenção", color: theme.coral, dark: true, icon: Wrench },
};

function StatusBadge({ status, vencido }) {
  if (vencido) {
    return (
      <Badge color={theme.coral} icon={AlertTriangle} label="Contrato vencido" />
    );
  }
  const cfg = MOTO_STATUS[status] || MOTO_STATUS.disponivel;
  return <Badge color={cfg.color} icon={cfg.icon} label={cfg.label} />;
}

function Badge({ color, icon: Icon, label }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ background: `${color}26`, color }}
    >
      <Icon size={11} /> {label}
    </span>
  );
}


// substitui a técnica de grid-template-rows (0fr/1fr) — o Safari do iPhone não colapsa
// esse truque de forma confiável, deixando o conteúdo "fechado" vazar por fora do card.
// Aqui medimos a altura real do conteúdo (scrollHeight) e animamos max-height em pixels,
// que funciona igual em qualquer navegador.
function Collapse({ open, children }) {
  const innerRef = useRef(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = innerRef.current;
    if (!open || !el) {
      setHeight(0);
      return;
    }
    setHeight(el.scrollHeight);
    // reajusta se o conteúdo mudar de altura depois de aberto (ex: a fonte do Google
    // Fonts ainda carregando na 1ª vez) — sem isso, a medida antiga ficava pequena
    // demais e cortava o final da lista sem dar pra perceber que faltava conteúdo
    const observer = new ResizeObserver(() => setHeight(el.scrollHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, children]);

  return (
    <div style={{ maxHeight: height, overflow: "hidden", transition: "max-height 0.28s ease" }}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  const [show, setShow] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 180);
  };

  const visible = show && !closing;

  return createPortal(
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(10,20,13,0.7)", opacity: visible ? 1 : 0, transition: "opacity 0.2s ease", zIndex: 999 }}
      onClick={handleClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-[24px] sm:rounded-[20px] p-5 max-h-[92vh] overflow-y-auto"
        style={{
          background: theme.panel,
          border: `1px solid ${theme.cardBorder}`,
          boxShadow: "0 -8px 30px rgba(0,0,0,0.25)",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0) scale(1)" : "translateY(28px) scale(0.97)",
          transition: "transform 0.24s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden mx-auto mb-3 rounded-full" style={{ width: 36, height: 5, background: theme.cardBorder }} />
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: HEAD_FONT, fontSize: 20, color: theme.text }}>{title}</h3>
          <button onClick={handleClose} className="mbr-hover-grow" style={{ color: theme.textMuted }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

// visualizador de PDF embutido na própria página — usa o leitor nativo do navegador
// dentro de um iframe (já vem com zoom, navegação de páginas, etc.), só com a
// nossa moldura verde em volta pra parecer parte do site
function PdfViewer({ url, title, onClose }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-2 sm:p-6"
      style={{ background: "rgba(10,20,13,0.85)", opacity: show ? 1 : 0, transition: "opacity 0.2s ease", zIndex: 999 }}
      onClick={onClose}
    >
      <div
        className="w-full h-full sm:w-[92vw] sm:h-[90vh] sm:max-w-4xl rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: theme.panel,
          border: `2px solid ${theme.mint}`,
          boxShadow: `0 0 0 4px ${theme.mint}26, 0 8px 40px rgba(0,0,0,0.5)`,
          opacity: show ? 1 : 0,
          transform: show ? "scale(1)" : "scale(0.97)",
          transition: "opacity 0.2s ease, transform 0.2s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 gap-3"
          style={{ borderBottom: `1px solid ${theme.cardBorder}`, background: theme.card }}
        >
          <span style={{ fontFamily: HEAD_FONT, fontSize: 15, color: theme.text }} className="truncate">
            {title}
          </span>
          <div className="flex items-center gap-3 flex-shrink-0">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold mbr-hover-grow"
              style={{ color: theme.blue }}
            >
              <ExternalLink size={13} /> Nova aba
            </a>
            <button onClick={onClose} className="mbr-hover-grow" style={{ color: theme.textMuted }}>
              <X size={20} />
            </button>
          </div>
        </div>
        <iframe src={url} title={title} style={{ flex: 1, border: "none", background: "#fff" }} />
      </div>
    </div>,
    document.body
  );
}

function FieldLabel({ children }) {
  return (
    <label className="text-xs uppercase tracking-wide mb-1 block" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  background: theme.bg,
  border: `1px solid ${theme.cardBorder}`,
  borderRadius: 10,
  padding: "9px 11px",
  color: theme.text,
  fontFamily: BODY_FONT,
  fontSize: 14,
  marginBottom: 12,
};

function SelectField({ value, onChange, options }) {
  return (
    <select style={{ ...inputStyle, appearance: "auto" }} value={value} onChange={onChange}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Row2({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{children}</div>;
}

/* ===========================================================
   ANEXO — link OU upload direto (até 3MB), guardado em chave própria
=========================================================== */
function AnexoField({ label, linkValue, storageKey, fileName, onChange }) {
  const [status, setStatus] = useState("");
  const inputRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setStatus("Arquivo acima de 20MB — use o link do Drive acima para arquivos maiores.");
      return;
    }
    setStatus("Enviando...");
    (async () => {
      const path = `${storageKey}-${nomeArquivoSeguro(file.name)}`;
      const url = await uploadArquivo(path, file);
      if (url) {
        onChange({ link: url, fileName: file.name });
        setStatus("");
      } else {
        setStatus("Não foi possível enviar o arquivo agora.");
      }
    })();
  };

  const handleRemove = () => {
    onChange({ link: "", fileName: "" });
    setStatus("");
  };

  return (
    <div className="mb-3">
      <FieldLabel>{label}</FieldLabel>
      <input
        style={inputStyle}
        value={linkValue}
        onChange={(e) => onChange({ link: e.target.value, fileName })}
        placeholder="Cole o link (Drive, etc.)"
      />
      <div className="flex items-center gap-2 flex-wrap -mt-1">
        <input ref={inputRef} type="file" onChange={handleFile} style={{ display: "none" }} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-xs font-semibold rounded-xl px-3 py-1.5"
          style={{ border: `1px solid ${theme.cardBorder}`, color: theme.text }}
        >
          Anexar arquivo
        </button>
        {fileName && linkValue && (
          <>
            <a
              href={linkValue}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold rounded-xl px-3 py-1.5 flex items-center gap-1"
              style={{ background: theme.mint, color: theme.mintText }}
            >
              <FileText size={12} /> {fileName}
            </a>
            <button type="button" onClick={handleRemove} className="mbr-hover-grow" style={{ color: theme.coral }}>
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
      {status && (
        <div className="text-xs mt-1.5" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
          {status}
        </div>
      )}
    </div>
  );
}

// campos antigos guardavam só 1 arquivo (ex: contratoLink/contratoArquivo) — os novos
// guardam uma lista. Isso lê os dois formatos pra não perder nada já salvo.
function anexosDe(lista, linkAntigo, nomeAntigo) {
  if (Array.isArray(lista)) return lista;
  if (linkAntigo) return [{ link: linkAntigo, fileName: nomeAntigo || "Anexo" }];
  return [];
}
const contratoAnexosOf = (contrato) => anexosDe(contrato?.anexos, contrato?.contratoLink, contrato?.contratoArquivo);
const notaFiscalAnexosOf = (moto) => anexosDe(moto?.notaFiscalAnexos, moto?.notaFiscalLink, moto?.notaFiscalArquivo);
const notaFiscalFabricaAnexosOf = (moto) => anexosDe(moto?.notaFiscalFabricaAnexos, null, null);

// botão único "Contrato" — se tiver só 1 anexo, abre direto; se tiver mais (várias
// páginas/fotos do mesmo contrato), abre uma listinha pra escolher qual página ver
function ContratoAnexosButton({ anexos, label = "Contrato", tituloPreview, onAbrir }) {
  const [aberto, setAberto] = useState(false);
  if (!anexos || anexos.length === 0) return null;

  if (anexos.length === 1) {
    return (
      <button
        onClick={() => onAbrir(anexos[0].link, tituloPreview)}
        className="inline-flex items-center gap-1 text-xs mbr-hover-grow"
        style={{ color: theme.blue }}
      >
        <FileText size={12} /> {label}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        className="inline-flex items-center gap-1 text-xs mbr-hover-grow"
        style={{ color: theme.blue }}
      >
        <FileText size={12} /> {label} ({anexos.length})
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div
            className="absolute z-20 mt-1 left-0 rounded-xl overflow-hidden flex flex-col mbr-fade-in"
            style={{ background: theme.panel, border: `1px solid ${theme.cardBorder}`, minWidth: 150, boxShadow: "0 6px 20px rgba(0,0,0,0.4)" }}
          >
            {anexos.map((a, i) => (
              <button
                key={i}
                onClick={() => {
                  onAbrir(a.link, `${tituloPreview} (${i + 1}/${anexos.length})`);
                  setAberto(false);
                }}
                className="flex items-center gap-2 px-3 py-2 text-xs text-left mbr-hover-grow"
                style={{ color: theme.text, borderBottom: i < anexos.length - 1 ? `1px solid ${theme.cardBorder}` : "none" }}
              >
                <FileText size={12} /> Página {i + 1}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// mostra de onde vem um valor passando o mouse por cima (computador) ou tocando nele
// (celular, já que touch não tem hover de verdade) — usado só nos "Próximos 7 dias".
// O popover vai num portal pro <body> e usa position:fixed calculado a partir do
// elemento-gatilho: se ficasse "position:absolute" dentro do card normal, o Reveal (que
// anima com transform) cria um novo contexto de empilhamento e o card seguinte da página
// acaba pintando por cima do popover, cortando ele — o portal escapa desse problema.
function ValorComDetalhe({ children, itens, fmt }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState(null);
  const gatilhoRef = useRef(null);

  const abrir = () => {
    const r = gatilhoRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 6, left: r.left });
    setAberto(true);
  };
  const fechar = () => setAberto(false);

  useEffect(() => {
    if (!aberto) return;
    const onScroll = () => fechar();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [aberto]);

  if (!itens || itens.length === 0) return children;
  return (
    <span
      ref={gatilhoRef}
      className="relative inline-block"
      onMouseEnter={abrir}
      onMouseLeave={fechar}
      onClick={(e) => {
        e.stopPropagation();
        aberto ? fechar() : abrir();
      }}
      style={{ cursor: "help" }}
    >
      {children}
      {aberto &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0" style={{ zIndex: 998 }} onClick={fechar} />
            <div
              className="fixed rounded-xl overflow-hidden mbr-fade-in"
              style={{
                top: pos.top,
                left: Math.max(8, Math.min(pos.left, window.innerWidth - 232)),
                zIndex: 999,
                background: theme.panel,
                border: `1px solid ${theme.cardBorder}`,
                minWidth: 220,
                maxWidth: "min(320px, 90vw)",
                boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
                padding: 10,
              }}
            >
              {itens.map((it, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 text-xs py-1"
                  style={{ color: theme.text, fontFamily: BODY_FONT, borderBottom: i < itens.length - 1 ? `1px solid ${theme.cardBorder}` : "none" }}
                >
                  <span className="truncate">{it.label}</span>
                  <span style={{ fontWeight: 700, flexShrink: 0 }}>{fmt(it.total)}</span>
                </div>
              ))}
            </div>
          </>,
          document.body
        )}
    </span>
  );
}

// igual ao AnexoField, mas permite anexar vários arquivos (ou vários links) no mesmo campo —
// útil pro contrato que às vezes vem em várias páginas/fotos separadas
function AnexoMultiField({ label, anexos, storageKey, onChange }) {
  const [status, setStatus] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const inputRef = useRef(null);
  const lista = anexos || [];

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    const validos = files.filter((f) => f.size <= 20 * 1024 * 1024);
    const grandesDemais = files.length - validos.length;
    if (validos.length === 0) {
      setStatus("Arquivo(s) acima de 20MB — use o link do Drive acima para arquivos maiores.");
      return;
    }
    setStatus(`Enviando ${validos.length > 1 ? `${validos.length} arquivos` : "arquivo"}...`);
    (async () => {
      const enviados = [];
      for (const file of validos) {
        const path = `${storageKey}-${Date.now()}-${nomeArquivoSeguro(file.name)}`;
        const url = await uploadArquivo(path, file);
        if (url) enviados.push({ link: url, fileName: file.name });
      }
      onChange([...lista, ...enviados]);
      if (enviados.length < validos.length || grandesDemais > 0) {
        setStatus("Algum arquivo não pôde ser enviado — tente de novo ou use o link do Drive.");
      } else {
        setStatus("");
      }
    })();
  };

  const adicionarLink = () => {
    const link = linkInput.trim();
    if (!link) return;
    onChange([...lista, { link, fileName: link.split("/").pop()?.split("?")[0] || "Link" }]);
    setLinkInput("");
  };

  const remover = (idx) => onChange(lista.filter((_, i) => i !== idx));

  return (
    <div className="mb-3">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-2 -mt-1 mb-2">
        <input
          style={{ ...inputStyle, marginBottom: 0 }}
          value={linkInput}
          onChange={(e) => setLinkInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), adicionarLink())}
          placeholder="Cole o link (Drive, etc.) e toque em +"
        />
        <button
          type="button"
          onClick={adicionarLink}
          className="rounded-xl px-3 text-sm font-semibold flex-shrink-0"
          style={{ border: `1px solid ${theme.cardBorder}`, color: theme.text }}
        >
          +
        </button>
      </div>
      <input ref={inputRef} type="file" multiple onChange={handleFiles} style={{ display: "none" }} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="text-xs font-semibold rounded-xl px-3 py-1.5 mb-2"
        style={{ border: `1px solid ${theme.cardBorder}`, color: theme.text }}
      >
        Anexar arquivo(s)
      </button>
      {lista.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-1">
          {lista.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-xl px-3 py-1.5" style={{ background: theme.card2 }}>
              <a
                href={a.link}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold flex items-center gap-1 min-w-0"
                style={{ color: theme.mint }}
              >
                <FileText size={12} className="flex-shrink-0" />
                <span className="truncate">{a.fileName || `Anexo ${i + 1}`}</span>
              </a>
              <button type="button" onClick={() => remover(i)} className="mbr-hover-grow flex-shrink-0" style={{ color: theme.coral }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {status && (
        <div className="text-xs mt-1" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
          {status}
        </div>
      )}
    </div>
  );
}

/* ===========================================================
   CLIENTES
=========================================================== */
function emptyCliente() {
  return {
    id: uid(),
    nome: "",
    cpfCnpj: "",
    telefone: "",
    email: "",
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
    observacoes: "",
  };
}

function ClienteFormModal({ cliente, onClose, onSave, title }) {
  const [form, setForm] = useState(cliente);
  const [cepStatus, setCepStatus] = useState(""); // "" | "buscando" | "ok" | "nao-encontrado"
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleCepBlur = async () => {
    const digits = (form.cep || "").replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepStatus("buscando");
    const endereco = await buscarEnderecoPorCEP(form.cep);
    if (!endereco) {
      setCepStatus("nao-encontrado");
      return;
    }
    setForm((f) => ({
      ...f,
      logradouro: endereco.logradouro || f.logradouro,
      bairro: endereco.bairro || f.bairro,
      cidade: endereco.cidade || f.cidade,
      estado: endereco.estado || f.estado,
    }));
    setCepStatus("ok");
  };

  return (
    <Modal title={title} onClose={onClose}>
      <FieldLabel>Nome completo</FieldLabel>
      <input style={inputStyle} value={form.nome} onChange={set("nome")} />
      <FieldLabel>CPF ou CNPJ</FieldLabel>
      <input
        style={inputStyle}
        value={form.cpfCnpj}
        onChange={(e) => setForm({ ...form, cpfCnpj: maskCpfCnpj(e.target.value) })}
        inputMode="numeric"
        placeholder="000.000.000-00"
      />
      <Row2>
        <div>
          <FieldLabel>Telefone</FieldLabel>
          <input
            style={inputStyle}
            value={form.telefone}
            onChange={(e) => setForm({ ...form, telefone: maskTelefone(e.target.value) })}
            inputMode="numeric"
            placeholder="(11) 90000-0000"
          />
        </div>
        <div>
          <FieldLabel>E-mail</FieldLabel>
          <input style={inputStyle} value={form.email} onChange={set("email")} />
        </div>
      </Row2>
      <FieldLabel>CEP</FieldLabel>
      <input
        style={inputStyle}
        value={form.cep}
        onChange={(e) => setForm({ ...form, cep: maskCep(e.target.value) })}
        onBlur={handleCepBlur}
        placeholder="00000-000"
        inputMode="numeric"
      />
      {cepStatus === "buscando" && (
        <div className="text-xs -mt-2 mb-3" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
          Buscando endereço...
        </div>
      )}
      {cepStatus === "nao-encontrado" && (
        <div className="text-xs -mt-2 mb-3" style={{ color: theme.coral, fontFamily: BODY_FONT }}>
          CEP não encontrado — preencha o endereço manualmente.
        </div>
      )}
      <FieldLabel>Logradouro</FieldLabel>
      <input style={inputStyle} value={form.logradouro} onChange={set("logradouro")} placeholder="Rua / Av." />
      <Row2>
        <div>
          <FieldLabel>Número</FieldLabel>
          <input style={inputStyle} value={form.numero} onChange={set("numero")} />
        </div>
        <div>
          <FieldLabel>Complemento</FieldLabel>
          <input style={inputStyle} value={form.complemento} onChange={set("complemento")} placeholder="Apto, bloco..." />
        </div>
      </Row2>
      <FieldLabel>Bairro</FieldLabel>
      <input style={inputStyle} value={form.bairro} onChange={set("bairro")} />
      <Row2>
        <div>
          <FieldLabel>Cidade</FieldLabel>
          <input style={inputStyle} value={form.cidade} onChange={set("cidade")} />
        </div>
        <div>
          <FieldLabel>Estado</FieldLabel>
          <input
            style={inputStyle}
            value={form.estado}
            onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase().slice(0, 2) })}
            placeholder="SP"
            maxLength={2}
          />
        </div>
      </Row2>
      <button onClick={() => onSave(form)} className="w-full rounded-xl py-2 font-semibold mt-1" style={{ background: theme.mint, color: theme.mintText }}>
        Salvar
      </button>
    </Modal>
  );
}

function VincularMotoModal({ cliente, motosDisponiveis, onClose, onSave }) {
  const [contratoId] = useState(uid());
  const [motoId, setMotoId] = useState(motosDisponiveis[0]?.id || "");
  const motoSelecionada = motosDisponiveis.find((m) => m.id === motoId);
  const nDefault = (motoSelecionada?.historicoContratos?.length || 0) + 1;
  const [contrato, setContrato] = useState({
    numeroContrato: nDefault,
    numeroClienteMoto: nDefault,
    valorMensal: "",
    formaPagamento: "Boleto Bancário",
    dataInicio: todayISO(),
    diaVencimento: "",
    dataTermino: "",
    anexos: [],
  });
  const setC = (k) => (e) => setContrato({ ...contrato, [k]: e.target.value });

  if (motosDisponiveis.length === 0) {
    return (
      <Modal title={`Vincular moto — ${cliente.nome || "cliente"}`} onClose={onClose}>
        <div style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
          Nenhuma moto disponível agora. Cadastre uma moto nova ou encerre o contrato de alguma na aba Motos primeiro.
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Vincular moto — ${cliente.nome || "cliente"}`} onClose={onClose}>
      <FieldLabel>Moto disponível</FieldLabel>
      <SelectField
        value={motoId}
        onChange={(e) => setMotoId(e.target.value)}
        options={motosDisponiveis.map((m) => ({ value: m.id, label: `${m.placa ? formatPlaca(m.placa) : "sem placa"} — ${m.modelo || "modelo?"}` }))}
      />
      <Row2>
        <div>
          <FieldLabel>Nº deste contrato (moto)</FieldLabel>
          <input type="number" min="1" style={inputStyle} value={contrato.numeroContrato} onChange={setC("numeroContrato")} />
        </div>
        <div>
          <FieldLabel>Nº do cliente (moto)</FieldLabel>
          <input type="number" min="1" style={inputStyle} value={contrato.numeroClienteMoto} onChange={setC("numeroClienteMoto")} />
        </div>
      </Row2>
      <Row2>
        <div>
          <FieldLabel>Início</FieldLabel>
          <input type="date" style={inputStyle} value={contrato.dataInicio} onChange={setC("dataInicio")} />
        </div>
        <div>
          <FieldLabel>Dia de vencimento</FieldLabel>
          <SelectField
            value={contrato.diaVencimento || ""}
            onChange={setC("diaVencimento")}
            options={[
              { value: "", label: "Selecione o dia" },
              ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `Dia ${i + 1}` })),
            ]}
          />
        </div>
      </Row2>
      <FieldLabel>Data de término (opcional)</FieldLabel>
      <input type="date" style={inputStyle} value={contrato.dataTermino || ""} onChange={setC("dataTermino")} />
      <div className="text-xs -mt-2 mb-3" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
        Se o aluguel tiver prazo definido, preenche aqui — assim a previsão em "Futuros" soma só até essa data. Deixe em branco se for indefinido.
      </div>
      <Row2>
        <div>
          <FieldLabel>Valor mensal</FieldLabel>
          <input type="number" step="0.01" style={inputStyle} value={contrato.valorMensal} onChange={setC("valorMensal")} />
        </div>
        <div>
          <FieldLabel>Forma de pagamento</FieldLabel>
          <input style={inputStyle} value={contrato.formaPagamento} onChange={setC("formaPagamento")} />
        </div>
      </Row2>
      <AnexoMultiField
        label="Contrato assinado"
        anexos={contrato.anexos}
        storageKey={`mobirelli-arquivo-contrato-${contratoId}`}
        onChange={(anexos) => setContrato({ ...contrato, anexos })}
      />
      <button
        onClick={() =>
          onSave({ motoId, contrato: { ...contrato, id: contratoId, valorMensal: Number(contrato.valorMensal) || 0 } })
        }
        className="w-full rounded-xl py-2 font-semibold mt-1"
        style={{ background: theme.mint, color: theme.mintText }}
      >
        Confirmar vínculo
      </button>
    </Modal>
  );
}

function ClientesView({ clientes, persistClientes, motos, persistMotos }) {
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState(null);
  const [expandido, setExpandido] = useState(null);
  const [preview, setPreview] = useState(null);

  const salvar = async (cliente) => {
    const existe = clientes.find((c) => c.id === cliente.id);
    const next = existe ? clientes.map((c) => (c.id === cliente.id ? cliente : c)) : [...clientes, cliente];
    await persistClientes(next);
    setModal(null);
  };

  const excluir = async (id) => persistClientes(clientes.filter((c) => c.id !== id));

  const vincularMoto = async (cliente, dados) => {
    const moto = motos.find((m) => m.id === dados.motoId);
    if (!moto) return;
    const atualizada = { ...moto, status: "alugada", contratoAtual: { ...dados.contrato, clienteId: cliente.id } };
    await persistMotos(motos.map((m) => (m.id === moto.id ? atualizada : m)));
    setModal(null);
  };

  const atualizarContrato = async (moto, dados) => {
    await persistMotos(motos.map((m) => (m.id === moto.id ? { ...m, contratoAtual: { ...m.contratoAtual, ...dados.contrato } } : m)));
    setModal(null);
  };

  const filtrados = clientes.filter((c) => {
    const q = busca.toLowerCase();
    return !q || c.nome?.toLowerCase().includes(q) || c.cpfCnpj?.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 style={{ fontFamily: HEAD_FONT, fontSize: 22, fontWeight: 800, color: theme.mint }}>Clientes</h2>
        <button
          onClick={() => setModal({ mode: "novo", cliente: emptyCliente() })}
          className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold"
          style={{ background: theme.mint, color: theme.mintText }}
        >
          <Plus size={16} /> Novo cliente
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: theme.textMuted }} />
        <input
          style={{ ...inputStyle, paddingLeft: 32, marginBottom: 0 }}
          placeholder="Buscar por nome ou CPF/CNPJ"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {filtrados.length === 0 && (
        <div className="rounded-2xl p-6 text-center" style={{ background: theme.card, color: theme.textMuted, fontFamily: BODY_FONT }}>
          Nenhum cliente encontrado.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtrados.map((c) => {
          const motoVinculada = motos.find((m) => m.contratoAtual?.clienteId === c.id);
          const aberto = expandido === c.id;
          return (
            <div key={c.id} className="rounded-2xl overflow-hidden" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
              <button className="w-full flex items-center justify-between px-4 py-3 text-left" onClick={() => setExpandido(aberto ? null : c.id)}>
                <div className="flex flex-col gap-1.5">
                  <div style={{ fontFamily: HEAD_FONT, fontSize: 17, color: theme.text }}>{c.nome || "Sem nome"}</div>
                  {motoVinculada ? (
                    <Badge color={theme.mint} icon={Bike} label={`Com a moto ${formatPlaca(motoVinculada.placa)}`} />
                  ) : (
                    <Badge color={theme.amber} icon={Clock} label="Sem moto no momento" />
                  )}
                </div>
                {aberto ? <ChevronUp size={18} color={theme.textMuted} /> : <ChevronDown size={18} color={theme.textMuted} />}
              </button>

              <Collapse open={aberto}>
                <div className="px-4 pb-4 text-sm" style={{ fontFamily: BODY_FONT }}>
                  <div className="flex flex-col gap-1 mb-3" style={{ color: theme.textMuted }}>
                    {c.cpfCnpj && <span>CPF/CNPJ: {c.cpfCnpj}</span>}
                    {c.telefone && (
                      <span className="flex items-center gap-1">
                        <Phone size={12} /> {c.telefone}
                      </span>
                    )}
                    {c.email && (
                      <span className="flex items-center gap-1">
                        <Mail size={12} /> {c.email}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <MapPin size={12} /> {enderecoCompleto(c)} {c.cep ? `— CEP ${c.cep}` : ""}
                    </span>
                  </div>

                  {motoVinculada && (
                    <div className="rounded-xl p-3 mb-3" style={{ background: theme.card2 }}>
                      <div className="flex items-center justify-between mb-1">
                        <MotoPlate placa={motoVinculada.placa} />
                        <span style={{ color: theme.amber, fontFamily: HEAD_FONT, fontSize: 17 }}>
                          {formatCurrency(motoVinculada.contratoAtual.valorMensal)}/mês
                        </span>
                      </div>
                      <div style={{ color: theme.textMuted, fontSize: 12 }}>
                        Contrato nº {motoVinculada.contratoAtual.numeroContrato}
                        {diaVencimentoDoContrato(motoVinculada.contratoAtual) && ` · vence todo dia ${diaVencimentoDoContrato(motoVinculada.contratoAtual)}`}
                        {motoVinculada.contratoAtual.dataTermino && ` · até ${formatDate(motoVinculada.contratoAtual.dataTermino)}`}
                      </div>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <ContratoAnexosButton
                          anexos={contratoAnexosOf(motoVinculada.contratoAtual)}
                          tituloPreview={`Contrato — ${formatPlaca(motoVinculada.placa)}`}
                          onAbrir={(url, title) => setPreview({ url, title })}
                        />
                        <button
                          onClick={() => setModal({ type: "contrato", moto: motoVinculada })}
                          className="inline-flex items-center gap-1 text-xs mbr-hover-grow"
                          style={{ color: theme.text }}
                        >
                          <Pencil size={12} /> Editar contrato
                        </button>
                      </div>
                    </div>
                  )}

                  {!motoVinculada && (
                    <button
                      onClick={() => setModal({ mode: "vincular", cliente: c })}
                      className="text-xs font-semibold rounded-xl px-3 py-1.5 mb-2"
                      style={{ background: theme.amber, color: theme.mintText }}
                    >
                      Vincular a uma moto disponível
                    </button>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => setModal({ mode: "editar", cliente: c })}
                      className="text-xs font-semibold rounded-xl px-3 py-1.5 flex items-center gap-1"
                      style={{ border: `1px solid ${theme.cardBorder}`, color: theme.text }}
                    >
                      <Pencil size={12} /> Editar
                    </button>
                    {!motoVinculada && (
                      <button
                        onClick={() => excluir(c.id)}
                        className="text-xs font-semibold rounded-xl px-3 py-1.5 flex items-center gap-1"
                        style={{ border: `1px solid ${theme.cardBorder}`, color: theme.coral }}
                      >
                        <Trash2 size={12} /> Excluir
                      </button>
                    )}
                  </div>
                </div>
              </Collapse>
            </div>
          );
        })}
      </div>

      {(modal?.mode === "novo" || modal?.mode === "editar") && (
        <ClienteFormModal
          title={modal.mode === "novo" ? "Cadastrar cliente" : "Editar cliente"}
          cliente={modal.cliente}
          onClose={() => setModal(null)}
          onSave={salvar}
        />
      )}
      {modal?.mode === "vincular" && (
        <VincularMotoModal
          cliente={modal.cliente}
          motosDisponiveis={motos.filter((m) => m.status === "disponivel")}
          onClose={() => setModal(null)}
          onSave={(dados) => vincularMoto(modal.cliente, dados)}
        />
      )}
      {modal?.type === "contrato" && (
        <ContratoModal
          moto={modal.moto}
          clientes={clientes}
          editando
          onClose={() => setModal(null)}
          onSave={(dados) => atualizarContrato(modal.moto, dados)}
        />
      )}
      {preview && <PdfViewer url={preview.url} title={preview.title} onClose={() => setPreview(null)} />}
    </div>
  );
}

/* ===========================================================
   MOTOS
=========================================================== */
function emptyMoto() {
  return {
    id: uid(),
    modelo: "",
    placa: "",
    chassi: "",
    renavam: "",
    dataCompra: todayISO(),
    nfNumero: "",
    valorCompra: "",
    notaFiscalAnexos: [],
    notaFiscalFabricaAnexos: [],
    documentoLink: "",
    documentoArquivo: "",
    certificadoLink: "",
    certificadoArquivo: "",
    linkRastreamento: "",
    status: "preparacao",
    contratoAtual: null,
    historicoContratos: [],
    manutencoes: [],
    custosExtras: [],
  };
}

/* ===========================================================
   RASTREIO — mapa próprio (Leaflet + tiles em tons de cinza), sem
   usar a tela da Melocaliza: só puxamos as coordenadas (endpoint público
   por trás do link de "Compartilhar localização") e desenhamos com a
   cara do nosso app.
=========================================================== */
const RASTREIO_HASH_PADRAO = "126b3fd40579524296cf586b7625cd97";

function itemsUrlFromLink(link) {
  const m = (link || "").match(/sharing\/([a-f0-9]+)/i);
  const hash = m ? m[1] : RASTREIO_HASH_PADRAO;
  return `https://web.melocaliza.com.br/sharing/${hash}/items`;
}

const RASTREIO_STATUS_COR = {
  green: theme.mint,
  yellow: theme.amber,
  red: theme.coral,
  black: theme.textMuted,
};

const RASTREIO_LEGENDA = [
  { cor: "green", label: "Em movimento" },
  { cor: "yellow", label: "Parada" },
  { cor: "red", label: "Offline" },
];

function rastreioMarkerHtml(placa, corHex) {
  const rotulo = `<div style="background:${theme.bg};border:1.5px solid ${corHex};border-radius:6px;padding:2px 7px;display:flex;align-items:center;gap:5px;white-space:nowrap;"><div style="width:5px;height:12px;background:${theme.blue};border-radius:2px;flex-shrink:0;"></div><span style="font-family:monospace;font-weight:700;font-size:11px;letter-spacing:0.5px;color:${theme.text};">${formatPlaca(placa)}</span></div>`;
  return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
      <div style="width:13px;height:13px;border-radius:50%;background:${corHex};box-shadow:0 0 0 5px ${corHex}33,0 1px 3px rgba(0,0,0,0.5);"></div>
      ${rotulo}
    </div>
  `;
}

function rastreioPopupHtml(placa, device, moto, clienteNome) {
  const cor = RASTREIO_STATUS_COR[device?.icon_color] || theme.mint;
  const velocidade = Number(device?.speed) || 0;
  const statusTxt = device?.online === "offline" ? "Offline" : velocidade > 0 ? `Em movimento · ${Math.round(velocidade)} km/h` : "Parada";
  const modelo = moto?.modelo ? `<div style="font-size:12px;color:${theme.textMuted};margin-top:2px;">${moto.modelo}</div>` : "";
  const contrato = moto?.contratoAtual
    ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid ${theme.cardBorder};font-size:12px;color:${theme.textMuted};">
         ${clienteNome ? `Cliente: <b style="color:${theme.text}">${clienteNome}</b><br/>` : ""}
         <span style="color:${theme.amber};font-weight:700;">${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(moto.contratoAtual.valorMensal || 0)}</span>/mês
       </div>`
    : "";
  return `
    <div style="font-family:${BODY_FONT};min-width:150px;">
      <div style="display:flex;align-items:center;gap:6px;"><div style="width:6px;height:14px;background:${theme.blue};border-radius:2px;flex-shrink:0;"></div><span style="font-family:monospace;font-weight:700;font-size:14px;letter-spacing:1px;color:${theme.text};">${formatPlaca(placa)}</span></div>
      ${modelo}
      <div style="font-size:12px;margin-top:4px;color:${cor};font-weight:600;">${statusTxt}</div>
      ${contrato}
    </div>
  `;
}

// borrão progressivo — usado nas barras de cima/baixo do Rastreio, que ficam por
// cima do mapa (não de um fundo sólido). Backdrop-filter só aceita um valor fixo de
// blur por elemento, então pra simular um borrão que vai AUMENTANDO conforme chega
// na borda da tela (em vez de um borrão uniforme), empilha várias camadas com o
// mesmo blur, cada uma "revelada" (via máscara) só numa faixa cada vez mais estreita
// perto da borda — perto da borda várias camadas se somam (mais borrado), perto de
// onde o degradê de opacidade começa nenhuma camada aparece (sem blur, nítido)
function BorraProgressiva({ lado }) {
  const camadas =
    lado === "topo"
      ? [
          { ate: 60, fim: 78 },
          { ate: 45, fim: 62 },
          { ate: 30, fim: 46 },
          { ate: 12, fim: 30 },
        ]
      : [
          { de: 40, inicio: 22 },
          { de: 55, inicio: 38 },
          { de: 70, inicio: 54 },
          { de: 88, inicio: 70 },
        ];
  return (
    <div className="absolute inset-0" style={{ zIndex: -1, pointerEvents: "none" }}>
      {camadas.map((c, i) => {
        const mask =
          lado === "topo"
            ? `linear-gradient(to bottom, #000 0%, #000 ${c.ate}%, transparent ${c.fim}%)`
            : `linear-gradient(to bottom, transparent ${c.inicio}%, #000 ${c.de}%, #000 100%)`;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              backdropFilter: "blur(1px)",
              WebkitBackdropFilter: "blur(1px)",
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        );
      })}
    </div>
  );
}

function MapToolButton({ icon: Icon, label, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex items-center justify-center rounded-full mbr-hover-grow"
      style={{
        width: 34,
        height: 34,
        background: active ? theme.mint : hexToRgba(theme.card, 0.92),
        color: active ? theme.mintText : theme.text,
        border: `1px solid ${theme.cardBorder}`,
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
      }}
    >
      <Icon size={16} />
    </button>
  );
}

function TrackingMap({ link, filterPlaca, height = 320, rounded = true, motos, clientes, topInset = 0, bottomInset = 0 }) {
  const containerRef = useRef(null);
  const mapObjRef = useRef(null);
  const markersRef = useRef({});
  const popupRef = useRef(null);
  const popupChaveRef = useRef(null);
  const tickRef = useRef(null);
  const primeiraCargaRef = useRef(true);
  const seguindoRef = useRef(null);
  const mostrarRastroRef = useRef(false);
  const motosRef = useRef(motos);
  const clientesRef = useRef(clientes);
  const [status, setStatus] = useState("carregando"); // carregando | ok | erro
  const [mostrarRastro, setMostrarRastro] = useState(false);

  useEffect(() => {
    mostrarRastroRef.current = mostrarRastro;
  }, [mostrarRastro]);

  useEffect(() => {
    motosRef.current = motos;
  }, [motos]);

  useEffect(() => {
    clientesRef.current = clientes;
  }, [clientes]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    primeiraCargaRef.current = true;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [-47.0, -22.9],
      zoom: 6,
      attributionControl: false,
    });
    mapObjRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // atribuição ao OpenStreetMap/MapLibre é exigida pela licença dos dados do mapa —
    // "compact" mantém isso, só troca a faixa cheia por um botão discreto "i"
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    // se a pessoa arrastar o mapa ou der zoom manualmente, para de seguir a moto —
    // "originalEvent" só existe quando o movimento veio de um gesto do usuário (mouse/touch/
    // scroll); os recentramentos automáticos (flyTo/easeTo) não disparam esses eventos
    const pararDeSeguir = (e) => {
      if (e.originalEvent) seguindoRef.current = null;
    };
    map.on("dragstart", pararDeSeguir);
    map.on("zoomstart", pararDeSeguir);

    async function tick() {
      try {
        const res = await fetch(itemsUrlFromLink(link));
        const data = await res.json();
        if (cancelled) return;

        const devices = Object.values(data).filter((d) =>
          filterPlaca ? (d.name || "").toUpperCase().startsWith(filterPlaca.toUpperCase()) : true
        );

        const bounds = new maplibregl.LngLatBounds();
        const vistos = new Set();

        devices.forEach((d) => {
          const lat = parseFloat(d.lat);
          const lng = parseFloat(d.lng);
          if (!lat || !lng) return;
          const chave = String(d.id);
          vistos.add(chave);
          const placa = (d.name || "").split(" - ")[0].trim();
          const cor = RASTREIO_STATUS_COR[d.icon_color] || theme.mint;

          if (markersRef.current[chave]) {
            markersRef.current[chave].marker.setLngLat([lng, lat]);
            markersRef.current[chave].placa = placa;
            markersRef.current[chave].cor = cor;
            markersRef.current[chave].device = d;
            if (seguindoRef.current === chave) {
              map.easeTo({ center: [lng, lat], duration: 900 });
            }
            // se o popup aberto é o dessa moto, ele também acompanha — sem isso, a câmera
            // seguia o ícone mas o balão de informações (com a velocidade) ficava parado
            // no lugar antigo, "descolando" da moto conforme ela andava
            if (popupChaveRef.current === chave && popupRef.current) {
              popupRef.current.setLngLat([lng, lat]);
              const moto = motosRef.current?.find((m) => (m.placa || "").toUpperCase() === placa.toUpperCase());
              const cliente = moto?.contratoAtual ? clientesRef.current?.find((c) => c.id === moto.contratoAtual.clienteId) : null;
              popupRef.current.setHTML(rastreioPopupHtml(placa, d, moto, cliente?.nome));
            }
          } else {
            const el = document.createElement("div");
            el.className = "mbr-map-marker";
            el.innerHTML = rastreioMarkerHtml(placa, cor);
            const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);
            markersRef.current[chave] = { marker, placa, cor, device: d };

            el.addEventListener("click", (ev) => {
              ev.stopPropagation();
              const entry = markersRef.current[chave];
              if (!entry) return;
              const ll = entry.marker.getLngLat();
              // ao clicar numa moto, a câmera passa a "segui-la": a cada atualização de
              // posição (tick) ela recentraliza sozinha, até a pessoa arrastar/dar zoom
              // manualmente no mapa (aí para de seguir — ver listeners de dragstart/zoomstart)
              seguindoRef.current = chave;
              map.flyTo({ center: ll, zoom: 16, duration: 600 });

              const moto = motosRef.current?.find((m) => (m.placa || "").toUpperCase() === entry.placa.toUpperCase());
              const cliente = moto?.contratoAtual ? clientesRef.current?.find((c) => c.id === moto.contratoAtual.clienteId) : null;

              if (popupRef.current) popupRef.current.remove();
              popupChaveRef.current = chave;
              // o pino (bolinha + etiqueta da placa) tem ~37px de altura acima do ponto —
              // offset menor que isso fazia o popup tampar um pouco o ícone; com 48px sobra
              // uma folguinha e o ícone fica 100% visível abaixo do balão
              popupRef.current = new maplibregl.Popup({ closeButton: true, offset: 48, className: "mbr-map-popup" })
                .setLngLat(ll)
                .setHTML(rastreioPopupHtml(entry.placa, entry.device, moto, cliente?.nome))
                .addTo(map);
              popupRef.current.on("close", () => {
                if (popupChaveRef.current === chave) popupChaveRef.current = null;
              });
            });
          }
          bounds.extend([lng, lat]);

          if (map.isStyleLoaded()) {
            const srcId = `trail-${chave}`;
            const coords = (d.tail || [])
              .map((p) => [parseFloat(p.lng), parseFloat(p.lat)])
              .filter(([lo, la]) => lo && la);
            const geojson = { type: "Feature", geometry: { type: "LineString", coordinates: coords } };
            const existente = map.getSource(srcId);
            if (existente) {
              existente.setData(geojson);
            } else if (coords.length > 1) {
              map.addSource(srcId, { type: "geojson", data: geojson });
              map.addLayer({
                id: `trail-line-${chave}`,
                type: "line",
                source: srcId,
                layout: { visibility: mostrarRastroRef.current ? "visible" : "none" },
                paint: { "line-color": theme.mint, "line-width": 2.5, "line-opacity": 0.55 },
              });
            }
          }
        });

        Object.keys(markersRef.current).forEach((chave) => {
          if (!vistos.has(chave)) {
            markersRef.current[chave].marker.remove();
            delete markersRef.current[chave];
            if (seguindoRef.current === chave) seguindoRef.current = null;
            if (popupChaveRef.current === chave) {
              popupRef.current?.remove();
              popupChaveRef.current = null;
            }
          }
        });

        // só centraliza sozinho na primeira vez que carrega — do contrário, a cada
        // atualização (a cada 20s) ele puxava o mapa de volta e desfazia o zoom/posição
        // que a pessoa tinha ajustado manualmente (ex: clicar numa moto pra acompanhar
        // ela de perto). Depois disso, só recentraliza no botão "Centralizar".
        if (!bounds.isEmpty() && primeiraCargaRef.current) {
          primeiraCargaRef.current = false;
          if (devices.length === 1) {
            map.easeTo({ center: bounds.getCenter(), zoom: 12, duration: 500 });
          } else {
            // padding maior no topo/base — os pinos têm uma etiqueta desenhada por cima
            // (não contabilizada pelo fitBounds, que só olha as coordenadas do ponto) e o
            // cabeçalho/menu inferior "flutuam" sobre o mapa, então sem essa folga extra
            // os marcadores das pontas ficavam escondidos atrás desses elementos
            map.fitBounds(bounds, {
              padding: { top: 90 + topInset, bottom: 50 + bottomInset, left: 60, right: 60 },
              maxZoom: 12,
              duration: 500,
            });
          }
        }

        setStatus("ok");
      } catch {
        if (!cancelled) setStatus("erro");
      }
    }

    tickRef.current = tick;
    map.on("load", tick);
    const interval = setInterval(tick, 20000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      Object.values(markersRef.current).forEach(({ marker }) => marker.remove());
      markersRef.current = {};
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapObjRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link, filterPlaca]);

  const centralizar = () => {
    seguindoRef.current = null;
    const map = mapObjRef.current;
    const marcadores = Object.values(markersRef.current).map((m) => m.marker);
    if (!map || marcadores.length === 0) return;
    if (marcadores.length === 1) {
      map.flyTo({ center: marcadores[0].getLngLat(), zoom: 12 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    marcadores.forEach((mk) => bounds.extend(mk.getLngLat()));
    map.fitBounds(bounds, {
      padding: { top: 90 + topInset, bottom: 50 + bottomInset, left: 60, right: 60 },
      maxZoom: 12,
      duration: 500,
    });
  };

  const alternarRastro = () => {
    const novo = !mostrarRastro;
    setMostrarRastro(novo);
    const map = mapObjRef.current;
    if (!map) return;
    (map.getStyle()?.layers || []).forEach((l) => {
      if (l.id.startsWith("trail-line-")) {
        map.setLayoutProperty(l.id, "visibility", novo ? "visible" : "none");
      }
    });
  };

  return (
    <div
      className={rounded ? "mbr-map rounded-2xl overflow-hidden relative" : "mbr-map overflow-hidden relative"}
      style={{
        border: rounded ? `1px solid ${theme.cardBorder}` : "none",
        height,
        "--mbr-top-inset": `${topInset}px`,
        "--mbr-bottom-inset": `${bottomInset}px`,
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div className="absolute left-3 flex gap-3 z-10" style={{ top: 12 + topInset }}>
        <MapToolButton icon={Crosshair} label="Centralizar" onClick={centralizar} />
        <MapToolButton icon={Route} label="Mostrar rastro" active={mostrarRastro} onClick={alternarRastro} />
        <MapToolButton icon={RefreshCw} label="Atualizar agora" onClick={() => tickRef.current?.()} />
      </div>

      <div
        className="absolute left-3 rounded-xl px-3 py-2 flex flex-col gap-1 z-10"
        style={{ bottom: 12 + bottomInset, background: hexToRgba(theme.card, 0.92), border: `1px solid ${theme.cardBorder}` }}
      >
        {RASTREIO_LEGENDA.map((l) => (
          <div key={l.cor} className="flex items-center gap-1.5 text-xs" style={{ color: theme.text, fontFamily: BODY_FONT }}>
            <span
              className="rounded-full flex-shrink-0"
              style={{ width: 9, height: 9, background: RASTREIO_STATUS_COR[l.cor] }}
            />
            {l.label}
          </div>
        ))}
      </div>

      {status === "erro" && (
        <div
          className="absolute inset-0 flex items-center justify-center text-xs text-center px-4"
          style={{ color: theme.textMuted, background: theme.card, fontFamily: BODY_FONT }}
        >
          Não foi possível carregar a localização agora.
        </div>
      )}
    </div>
  );
}

function MotoTrackingBlock({ link, placa }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold rounded-xl px-3 py-1.5"
        style={{ background: hexToRgba(theme.blue, 0.16), color: theme.blue }}
      >
        <MapPin size={13} /> {aberto ? "Ocultar localização" : "Ver localização em tempo real"}
      </button>
      <Collapse open={aberto}>
        <div className="mt-2">{aberto && <TrackingMap link={link} filterPlaca={placa} height={280} />}</div>
      </Collapse>
    </div>
  );
}

function MotoFormModal({ moto, onClose, onSave, title }) {
  const [form, setForm] = useState({
    ...emptyMoto(),
    ...moto,
    notaFiscalAnexos: notaFiscalAnexosOf(moto),
    notaFiscalFabricaAnexos: notaFiscalFabricaAnexosOf(moto),
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal title={title} onClose={onClose}>
      <FieldLabel>Modelo</FieldLabel>
      <input style={inputStyle} value={form.modelo} onChange={set("modelo")} placeholder="JTZ/DK160 S" />
      <Row2>
        <div>
          <FieldLabel>Placa</FieldLabel>
          <input
            style={inputStyle}
            value={formatPlaca(form.placa)}
            onChange={(e) => setForm({ ...form, placa: placaLimpa(e.target.value) })}
            placeholder="URB-5I50"
          />
        </div>
        <div>
          <FieldLabel>Status</FieldLabel>
          <SelectField
            value={form.status}
            onChange={set("status")}
            options={
              form.status === "alugada"
                ? [{ value: "alugada", label: "Alugada (encerre o contrato p/ mudar)" }]
                : [
                    { value: "preparacao", label: "Em preparação" },
                    { value: "disponivel", label: "Disponível" },
                    { value: "manutencao", label: "Em manutenção" },
                  ]
            }
          />
        </div>
      </Row2>
      <Row2>
        <div>
          <FieldLabel>Chassi</FieldLabel>
          <input style={inputStyle} value={form.chassi} onChange={set("chassi")} />
        </div>
        <div>
          <FieldLabel>Renavam</FieldLabel>
          <input style={inputStyle} value={form.renavam} onChange={set("renavam")} />
        </div>
      </Row2>
      <Row2>
        <div>
          <FieldLabel>Data da compra</FieldLabel>
          <input type="date" style={inputStyle} value={form.dataCompra} onChange={set("dataCompra")} />
        </div>
        <div>
          <FieldLabel>Valor da compra</FieldLabel>
          <input type="number" step="0.01" style={inputStyle} value={form.valorCompra} onChange={set("valorCompra")} />
        </div>
      </Row2>
      <FieldLabel>Nº da nota fiscal</FieldLabel>
      <input style={inputStyle} value={form.nfNumero} onChange={set("nfNumero")} />
      <AnexoMultiField
        label="Nota fiscal"
        anexos={form.notaFiscalAnexos}
        storageKey={`mobirelli-arquivo-nf-${form.id}`}
        onChange={(anexos) => setForm({ ...form, notaFiscalAnexos: anexos })}
      />
      <AnexoMultiField
        label="Nota fiscal de fábrica"
        anexos={form.notaFiscalFabricaAnexos}
        storageKey={`mobirelli-arquivo-nf-fabrica-${form.id}`}
        onChange={(anexos) => setForm({ ...form, notaFiscalFabricaAnexos: anexos })}
      />
      <AnexoField
        label="Documento da moto (CRLV, etc.)"
        linkValue={form.documentoLink}
        storageKey={`mobirelli-arquivo-doc-${form.id}`}
        fileName={form.documentoArquivo}
        onChange={(v) => setForm({ ...form, documentoLink: v.link, documentoArquivo: v.fileName })}
      />
      <AnexoField
        label="Certificado de garantia"
        linkValue={form.certificadoLink}
        storageKey={`mobirelli-arquivo-cert-${form.id}`}
        fileName={form.certificadoArquivo}
        onChange={(v) => setForm({ ...form, certificadoLink: v.link, certificadoArquivo: v.fileName })}
      />
      <FieldLabel>Link de rastreamento (Melocaliza)</FieldLabel>
      <input
        style={inputStyle}
        value={form.linkRastreamento}
        onChange={set("linkRastreamento")}
        placeholder="https://web.melocaliza.com.br/sharing/..."
      />
      <div className="text-xs -mt-2 mb-3" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
        Na Melocaliza: Compartilhar localização → Novo → escolha esta moto → validade "Nenhum" → copie o link gerado.
      </div>
      <button onClick={() => onSave(form)} className="w-full rounded-xl py-2 font-semibold mt-1" style={{ background: theme.mint, color: theme.mintText }}>
        Salvar
      </button>
    </Modal>
  );
}

function ContratoModal({ moto, clientes, onClose, onSave, editando }) {
  const [contratoId] = useState(moto.contratoAtual?.id || uid());
  const [clienteId, setClienteId] = useState("novo");
  const [novoCliente, setNovoCliente] = useState(emptyCliente());
  const nContratoDefault = (moto.historicoContratos?.length || 0) + 1;
  const [contrato, setContrato] = useState(
    editando
      ? {
          dataTermino: "",
          ...moto.contratoAtual,
          diaVencimento: diaVencimentoDoContrato(moto.contratoAtual) || "",
          anexos: contratoAnexosOf(moto.contratoAtual),
        }
      : {
          numeroContrato: nContratoDefault,
          numeroClienteMoto: nContratoDefault,
          valorMensal: "",
          formaPagamento: "Boleto Bancário",
          dataInicio: todayISO(),
          diaVencimento: "",
          dataTermino: "",
          anexos: [],
        }
  );

  const [cepStatus, setCepStatus] = useState(""); // "" | "buscando" | "ok" | "nao-encontrado"
  const setNC = (k) => (e) => setNovoCliente({ ...novoCliente, [k]: e.target.value });
  const setC = (k) => (e) => setContrato({ ...contrato, [k]: e.target.value });

  const handleCepBlur = async () => {
    const digits = (novoCliente.cep || "").replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepStatus("buscando");
    const endereco = await buscarEnderecoPorCEP(novoCliente.cep);
    if (!endereco) {
      setCepStatus("nao-encontrado");
      return;
    }
    setNovoCliente((c) => ({
      ...c,
      logradouro: endereco.logradouro || c.logradouro,
      bairro: endereco.bairro || c.bairro,
      cidade: endereco.cidade || c.cidade,
      estado: endereco.estado || c.estado,
    }));
    setCepStatus("ok");
  };

  const clienteAtual = editando ? clientes.find((c) => c.id === moto.contratoAtual?.clienteId) : null;

  return (
    <Modal
      title={editando ? `Editar contrato — ${moto.placa ? formatPlaca(moto.placa) : moto.modelo}` : `Novo contrato — ${moto.placa ? formatPlaca(moto.placa) : moto.modelo}`}
      onClose={onClose}
    >
      {editando ? (
        <div className="rounded-xl p-3 mb-3" style={{ background: theme.card2 }}>
          <FieldLabel>Cliente</FieldLabel>
          <div style={{ color: theme.text, fontFamily: BODY_FONT }}>{clienteAtual?.nome || "Cliente"}</div>
          <div className="text-xs mt-1" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
            Pra trocar de cliente, encerre este contrato e cadastre um novo aluguel.
          </div>
        </div>
      ) : (
        <>
      <FieldLabel>Cliente</FieldLabel>
      <SelectField
        value={clienteId}
        onChange={(e) => setClienteId(e.target.value)}
        options={[{ value: "novo", label: "+ Cadastrar novo cliente" }, ...clientes.map((c) => ({ value: c.id, label: c.nome || "Sem nome" }))]}
      />

      {clienteId === "novo" ? (
        <div className="rounded-xl p-3 mb-2" style={{ background: theme.card2 }}>
          <FieldLabel>Nome completo</FieldLabel>
          <input style={inputStyle} value={novoCliente.nome} onChange={setNC("nome")} />
          <FieldLabel>CPF ou CNPJ</FieldLabel>
          <input
            style={inputStyle}
            value={novoCliente.cpfCnpj}
            onChange={(e) => setNovoCliente({ ...novoCliente, cpfCnpj: maskCpfCnpj(e.target.value) })}
            inputMode="numeric"
            placeholder="000.000.000-00"
          />
          <Row2>
            <div>
              <FieldLabel>Telefone</FieldLabel>
              <input
                style={inputStyle}
                value={novoCliente.telefone}
                onChange={(e) => setNovoCliente({ ...novoCliente, telefone: maskTelefone(e.target.value) })}
                inputMode="numeric"
                placeholder="(11) 90000-0000"
              />
            </div>
            <div>
              <FieldLabel>E-mail</FieldLabel>
              <input style={inputStyle} value={novoCliente.email} onChange={setNC("email")} />
            </div>
          </Row2>
          <FieldLabel>CEP</FieldLabel>
          <input
            style={inputStyle}
            value={novoCliente.cep}
            onChange={(e) => setNovoCliente({ ...novoCliente, cep: maskCep(e.target.value) })}
            onBlur={handleCepBlur}
            placeholder="00000-000"
            inputMode="numeric"
          />
          {cepStatus === "buscando" && (
            <div className="text-xs -mt-2 mb-3" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
              Buscando endereço...
            </div>
          )}
          {cepStatus === "nao-encontrado" && (
            <div className="text-xs -mt-2 mb-3" style={{ color: theme.coral, fontFamily: BODY_FONT }}>
              CEP não encontrado — preencha o endereço manualmente.
            </div>
          )}
          <FieldLabel>Logradouro</FieldLabel>
          <input style={inputStyle} value={novoCliente.logradouro} onChange={setNC("logradouro")} />
          <Row2>
            <div>
              <FieldLabel>Número</FieldLabel>
              <input style={inputStyle} value={novoCliente.numero} onChange={setNC("numero")} />
            </div>
            <div>
              <FieldLabel>Complemento</FieldLabel>
              <input style={inputStyle} value={novoCliente.complemento} onChange={setNC("complemento")} placeholder="Apto, bloco..." />
            </div>
          </Row2>
          <FieldLabel>Bairro</FieldLabel>
          <input style={inputStyle} value={novoCliente.bairro} onChange={setNC("bairro")} />
          <Row2>
            <div>
              <FieldLabel>Cidade</FieldLabel>
              <input style={inputStyle} value={novoCliente.cidade} onChange={setNC("cidade")} />
            </div>
            <div>
              <FieldLabel>Estado</FieldLabel>
              <input
                style={inputStyle}
                value={novoCliente.estado}
                onChange={(e) => setNovoCliente({ ...novoCliente, estado: e.target.value.toUpperCase().slice(0, 2) })}
                placeholder="SP"
                maxLength={2}
              />
            </div>
          </Row2>
        </div>
      ) : null}
        </>
      )}

      <Row2>
        <div>
          <FieldLabel>Nº deste contrato (moto)</FieldLabel>
          <input type="number" min="1" style={inputStyle} value={contrato.numeroContrato} onChange={setC("numeroContrato")} />
        </div>
        <div>
          <FieldLabel>Nº do cliente (moto)</FieldLabel>
          <input type="number" min="1" style={inputStyle} value={contrato.numeroClienteMoto} onChange={setC("numeroClienteMoto")} />
        </div>
      </Row2>
      <Row2>
        <div>
          <FieldLabel>Início</FieldLabel>
          <input type="date" style={inputStyle} value={contrato.dataInicio} onChange={setC("dataInicio")} />
        </div>
        <div>
          <FieldLabel>Dia de vencimento</FieldLabel>
          <SelectField
            value={contrato.diaVencimento || ""}
            onChange={setC("diaVencimento")}
            options={[
              { value: "", label: "Selecione o dia" },
              ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `Dia ${i + 1}` })),
            ]}
          />
        </div>
      </Row2>
      <FieldLabel>Data de término (opcional)</FieldLabel>
      <input type="date" style={inputStyle} value={contrato.dataTermino || ""} onChange={setC("dataTermino")} />
      <div className="text-xs -mt-2 mb-3" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
        Se o aluguel tiver prazo definido, preenche aqui — assim a previsão em "Futuros" soma só até essa data. Deixe em branco se for indefinido.
      </div>
      <Row2>
        <div>
          <FieldLabel>Valor mensal</FieldLabel>
          <input type="number" step="0.01" style={inputStyle} value={contrato.valorMensal} onChange={setC("valorMensal")} />
        </div>
        <div>
          <FieldLabel>Forma de pagamento</FieldLabel>
          <input style={inputStyle} value={contrato.formaPagamento} onChange={setC("formaPagamento")} />
        </div>
      </Row2>

      <AnexoMultiField
        label="Contrato assinado"
        anexos={contrato.anexos}
        storageKey={`mobirelli-arquivo-contrato-${contratoId}`}
        onChange={(anexos) => setContrato({ ...contrato, anexos })}
      />

      <button
        onClick={() =>
          onSave({
            clienteId,
            novoCliente,
            contrato: { ...contrato, id: contratoId, valorMensal: Number(contrato.valorMensal) || 0 },
          })
        }
        className="w-full rounded-xl py-2 font-semibold mt-1"
        style={{ background: theme.mint, color: theme.mintText }}
      >
        {editando ? "Salvar contrato" : "Confirmar aluguel"}
      </button>
    </Modal>
  );
}

function emptyManutencao() {
  return { id: uid(), data: todayISO(), tipo: "", valorGasto: "", local: "", garantia: false };
}

function emptyCustoExtra() {
  return { id: uid(), data: todayISO(), descricao: "", valorGasto: "" };
}

function CustoExtraModal({ onClose, onSave }) {
  const [form, setForm] = useState(emptyCustoExtra());
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal title="Novo custo da moto" onClose={onClose}>
      <FieldLabel>Data</FieldLabel>
      <input type="date" style={inputStyle} value={form.data} onChange={set("data")} />
      <FieldLabel>Descrição</FieldLabel>
      <input style={inputStyle} value={form.descricao} onChange={set("descricao")} placeholder="Despachante, documentação, comissão..." />
      <FieldLabel>Valor gasto</FieldLabel>
      <input type="number" step="0.01" style={inputStyle} value={form.valorGasto} onChange={set("valorGasto")} />
      <button
        onClick={() => onSave({ ...form, valorGasto: Number(form.valorGasto) || 0 })}
        className="w-full rounded-xl py-2 font-semibold mt-1"
        style={{ background: theme.mint, color: theme.mintText }}
      >
        Salvar
      </button>
    </Modal>
  );
}

function ManutencaoModal({ onClose, onSave }) {
  const [form, setForm] = useState(emptyManutencao());
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal title="Nova manutenção" onClose={onClose}>
      <FieldLabel>Data</FieldLabel>
      <input type="date" style={inputStyle} value={form.data} onChange={set("data")} />
      <FieldLabel>Tipo de manutenção</FieldLabel>
      <input style={inputStyle} value={form.tipo} onChange={set("tipo")} placeholder="Troca de óleo, pneu..." />
      <Row2>
        <div>
          <FieldLabel>Valor gasto</FieldLabel>
          <input type="number" step="0.01" style={inputStyle} value={form.valorGasto} onChange={set("valorGasto")} />
        </div>
        <div>
          <FieldLabel>Local</FieldLabel>
          <input style={inputStyle} value={form.local} onChange={set("local")} />
        </div>
      </Row2>
      <label className="flex items-center gap-2 mb-3 text-sm" style={{ color: theme.text, fontFamily: BODY_FONT }}>
        <input type="checkbox" checked={form.garantia} onChange={(e) => setForm({ ...form, garantia: e.target.checked })} />
        Coberto por garantia
      </label>
      <button
        onClick={() => onSave({ ...form, valorGasto: Number(form.valorGasto) || 0 })}
        className="w-full rounded-xl py-2 font-semibold mt-1"
        style={{ background: theme.mint, color: theme.mintText }}
      >
        Salvar
      </button>
    </Modal>
  );
}

function ConsultaPlacaModal({ onClose }) {
  const [placa, setPlaca] = useState("");
  const [status, setStatus] = useState("idle"); // idle | carregando | ok | erro
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");

  const consultar = async () => {
    if (!placa.trim() || status === "carregando") return;
    setStatus("carregando");
    setErro("");
    try {
      const res = await fetch(`/api/consulta-placa?placa=${encodeURIComponent(placa)}`);
      const data = await res.json();
      if (!res.ok || data.erro) {
        setErro(data.erro || "Não foi possível consultar essa placa agora.");
        setStatus("erro");
        return;
      }
      setResultado(data);
      setStatus("ok");
    } catch {
      setErro("Falha de conexão. Tente de novo.");
      setStatus("erro");
    }
  };

  const dados = resultado?.dados || resultado?.data || resultado || {};
  const pegar = (...chaves) => chaves.map((c) => dados[c]).find((v) => v != null && v !== "");

  const Campo = ({ label, valor }) =>
    valor ? (
      <div className="flex justify-between text-sm py-1.5" style={{ borderBottom: `1px solid ${theme.cardBorder}` }}>
        <span style={{ color: theme.textMuted }}>{label}</span>
        <span style={{ color: theme.text, fontWeight: 600, textAlign: "right" }}>{String(valor)}</span>
      </div>
    ) : null;

  return (
    <Modal title="Consulta de placa" onClose={onClose}>
      <FieldLabel>Placa</FieldLabel>
      <div className="flex gap-2 mb-1">
        <input
          style={{ ...inputStyle, marginBottom: 0, textTransform: "uppercase" }}
          value={placa}
          onChange={(e) => setPlaca(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && consultar()}
          placeholder="ABC1D23"
          maxLength={8}
        />
        <button
          onClick={consultar}
          disabled={status === "carregando"}
          className="rounded-xl px-4 font-semibold text-sm"
          style={{ background: theme.mint, color: theme.mintText, opacity: status === "carregando" ? 0.6 : 1 }}
        >
          Consultar
        </button>
      </div>
      <div className="text-xs mb-3" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
        Dados públicos de veículos (marca, modelo, ano, cor). Não substitui uma consulta oficial no Detran.
      </div>

      {status === "carregando" && (
        <div className="text-sm" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
          Consultando...
        </div>
      )}

      {status === "erro" && (
        <div className="rounded-xl p-3 text-sm" style={{ background: `${theme.coral}1F`, color: theme.coral, fontFamily: BODY_FONT }}>
          {erro}
        </div>
      )}

      {status === "ok" && (
        <div className="rounded-xl p-3" style={{ background: theme.card2, fontFamily: BODY_FONT }}>
          <Campo label="Marca" valor={pegar("marca", "MARCA", "brand")} />
          <Campo label="Modelo" valor={pegar("modelo", "MODELO", "model")} />
          <Campo label="Ano fabricação" valor={pegar("ano", "anoFabricacao", "ANO", "year")} />
          <Campo label="Ano modelo" valor={pegar("anoModelo", "ANO_MODELO", "modelYear")} />
          <Campo label="Cor" valor={pegar("cor", "COR", "color")} />
          <Campo label="Chassi" valor={pegar("chassi", "CHASSI", "chassis")} />
          <Campo label="Município" valor={pegar("municipio", "MUNICIPIO", "city")} />
          <Campo label="UF" valor={pegar("uf", "UF", "state")} />
          <Campo label="Situação" valor={pegar("situacao", "SITUACAO", "status")} />
        </div>
      )}
    </Modal>
  );
}

function MotosView({ motos, persist, clientes, persistClientes, config, lancamentos }) {
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState(null);
  const [modal, setModal] = useState(null);
  const [preview, setPreview] = useState(null);

  const salvarMoto = async (moto) => {
    const existe = motos.find((m) => m.id === moto.id);
    const next = existe ? motos.map((m) => (m.id === moto.id ? moto : m)) : [...motos, moto];
    await persist(next);
    setModal(null);
  };

  const excluirMoto = async (id) => persist(motos.filter((m) => m.id !== id));

  const confirmarContrato = async (moto, dados) => {
    let clienteId = dados.clienteId;
    if (clienteId === "novo") {
      await persistClientes([...clientes, dados.novoCliente]);
      clienteId = dados.novoCliente.id;
    }
    const atualizado = {
      ...moto,
      status: "alugada",
      contratoAtual: { ...dados.contrato, clienteId },
    };
    await salvarMoto(atualizado);
    setModal(null);
  };

  const atualizarContrato = async (moto, dados) => {
    await salvarMoto({ ...moto, contratoAtual: { ...moto.contratoAtual, ...dados.contrato } });
    setModal(null);
  };

  const encerrarContrato = async (moto) => {
    if (!moto.contratoAtual) return;
    const encerrado = { ...moto.contratoAtual, encerradoEm: todayISO() };
    await salvarMoto({
      ...moto,
      status: "disponivel",
      contratoAtual: null,
      historicoContratos: [...(moto.historicoContratos || []), encerrado],
    });
  };

  const salvarManutencao = async (moto, manutencao) => {
    await salvarMoto({ ...moto, manutencoes: [...(moto.manutencoes || []), manutencao] });
    setModal(null);
  };

  const salvarCustoExtra = async (moto, custo) => {
    await salvarMoto({ ...moto, custosExtras: [...(moto.custosExtras || []), custo] });
    setModal(null);
  };

  const filtradas = motos.filter((m) => {
    const q = busca.toLowerCase();
    const qLimpo = placaLimpa(busca).toLowerCase();
    return (
      !q ||
      [m.placa, m.chassi, m.renavam, m.modelo].some((f) => f?.toLowerCase().includes(q)) ||
      (qLimpo && m.placa?.toLowerCase().includes(qLimpo))
    );
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 style={{ fontFamily: HEAD_FONT, fontSize: 22, fontWeight: 800, color: theme.mint }}>Motos</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModal({ type: "consulta" })}
            className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ border: `1px solid ${theme.cardBorder}`, color: theme.text }}
          >
            <Search size={15} /> Consultar placa
          </button>
          <button
            onClick={() => setModal({ type: "moto", mode: "novo", moto: emptyMoto() })}
            className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ background: theme.mint, color: theme.mintText }}
          >
            <Plus size={16} /> Nova moto
          </button>
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: theme.textMuted }} />
        <input
          style={{ ...inputStyle, paddingLeft: 32, marginBottom: 0 }}
          placeholder="Buscar por placa, chassi, renavam ou modelo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {filtradas.length === 0 && (
        <div className="rounded-2xl p-6 text-center" style={{ background: theme.card, color: theme.textMuted, fontFamily: BODY_FONT }}>
          Nenhuma moto encontrada.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtradas.map((moto) => {
          const vencido = moto.status === "alugada" && isContratoVencido(moto.contratoAtual);
          const cliente = clientes.find((c) => c.id === moto.contratoAtual?.clienteId);
          const pagamentos = pagamentosDaMoto(moto, lancamentos);
          const aberto = expandido === moto.id;
          return (
            <div key={moto.id} className="rounded-2xl overflow-hidden" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
              <button className="w-full flex items-center justify-between px-4 py-3 text-left" onClick={() => setExpandido(aberto ? null : moto.id)}>
                <div className="flex flex-col gap-3">
                  <MotoPlate placa={moto.placa} />
                  <StatusBadge status={moto.status} vencido={vencido} />
                </div>
                {aberto ? <ChevronUp size={18} color={theme.textMuted} /> : <ChevronDown size={18} color={theme.textMuted} />}
              </button>

              <Collapse open={aberto}>
                <div className="px-4 pb-4 text-sm" style={{ fontFamily: BODY_FONT }}>
                  <div style={{ fontFamily: HEAD_FONT, fontSize: 16, color: theme.text }} className="mb-3">
                    {moto.modelo || "Modelo não informado"}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-3" style={{ color: theme.textMuted }}>
                    <span>Chassi: {moto.chassi || "—"}</span>
                    <span>Renavam: {moto.renavam || "—"}</span>
                    <span>Compra: {formatDate(moto.dataCompra)}</span>
                    <span>Valor: {formatCurrency(moto.valorCompra)}</span>
                  </div>

                  <MotoTrackingBlock link={moto.linkRastreamento || config?.linkRastreioGeral} placa={moto.placa} />

                  <div className="flex items-center gap-3 flex-wrap mb-3">
                    {notaFiscalAnexosOf(moto).map((a, i, lista) => (
                      <button
                        key={`nf-${i}`}
                        onClick={() => setPreview({ url: a.link, title: `Nota fiscal — ${formatPlaca(moto.placa)}` })}
                        className="inline-flex items-center gap-1 text-xs mbr-hover-grow"
                        style={{ color: theme.blue }}
                      >
                        <FileText size={12} /> {lista.length > 1 ? `Nota fiscal ${i + 1}` : "Nota fiscal"}
                      </button>
                    ))}
                    {notaFiscalFabricaAnexosOf(moto).map((a, i, lista) => (
                      <button
                        key={`nff-${i}`}
                        onClick={() => setPreview({ url: a.link, title: `Nota fiscal de fábrica — ${formatPlaca(moto.placa)}` })}
                        className="inline-flex items-center gap-1 text-xs mbr-hover-grow"
                        style={{ color: theme.blue }}
                      >
                        <FileText size={12} /> {lista.length > 1 ? `Nota fiscal de fábrica ${i + 1}` : "Nota fiscal de fábrica"}
                      </button>
                    ))}
                    {moto.documentoLink && (
                      <button
                        onClick={() => setPreview({ url: moto.documentoLink, title: `Documento — ${formatPlaca(moto.placa)}` })}
                        className="inline-flex items-center gap-1 text-xs mbr-hover-grow"
                        style={{ color: theme.blue }}
                      >
                        <FileText size={12} /> Documento
                      </button>
                    )}
                    {moto.certificadoLink && (
                      <button
                        onClick={() => setPreview({ url: moto.certificadoLink, title: `Certificado de garantia — ${formatPlaca(moto.placa)}` })}
                        className="inline-flex items-center gap-1 text-xs mbr-hover-grow"
                        style={{ color: theme.blue }}
                      >
                        <FileText size={12} /> Certificado de garantia
                      </button>
                    )}
                  </div>

                  {moto.contratoAtual ? (
                    <div className="rounded-xl p-3 mb-3" style={{ background: theme.card2 }}>
                      <div className="flex items-center justify-between mb-1">
                        <span style={{ color: theme.text, fontWeight: 600 }}>{cliente?.nome || "Cliente"}</span>
                        <span style={{ color: theme.amber, fontFamily: HEAD_FONT, fontSize: 17 }}>
                          {formatCurrency(moto.contratoAtual.valorMensal)}/mês
                        </span>
                      </div>
                      <div style={{ color: theme.textMuted, fontSize: 12 }}>
                        {moto.contratoAtual.numeroClienteMoto}º cliente · contrato nº {moto.contratoAtual.numeroContrato}
                        {diaVencimentoDoContrato(moto.contratoAtual) && ` · vence todo dia ${diaVencimentoDoContrato(moto.contratoAtual)}`}
                        {moto.contratoAtual.dataTermino && ` · até ${formatDate(moto.contratoAtual.dataTermino)}`}
                      </div>
                      {contratoAnexosOf(moto.contratoAtual).length > 0 && (
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <ContratoAnexosButton
                            anexos={contratoAnexosOf(moto.contratoAtual)}
                            tituloPreview={`Contrato — ${formatPlaca(moto.placa)}`}
                            onAbrir={(url, title) => setPreview({ url, title })}
                          />
                        </div>
                      )}
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => setModal({ type: "contrato", mode: "editar", moto })}
                          className="text-xs font-semibold rounded-xl px-3 py-1.5 flex items-center gap-1"
                          style={{ border: `1px solid ${theme.cardBorder}`, color: theme.text }}
                        >
                          <Pencil size={12} /> Editar contrato
                        </button>
                        <button
                          onClick={() => encerrarContrato(moto)}
                          className="text-xs font-semibold rounded-xl px-3 py-1.5"
                          style={{ border: `1px solid ${theme.cardBorder}`, color: theme.text }}
                        >
                          Encerrar contrato
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mb-2">
                    <span className="text-xs uppercase tracking-wide" style={{ color: theme.textMuted }}>
                      Pagamentos recebidos (fluxo de caixa)
                    </span>
                    {pagamentos.length === 0 ? (
                      <div style={{ color: theme.textMuted, fontSize: 12 }} className="mt-1">
                        Nenhum pagamento com "{formatPlaca(moto.placa)}" na categoria/descrição ainda.
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between text-xs mt-1 mb-1" style={{ color: theme.mint, fontWeight: 700 }}>
                          <span>Total recebido</span>
                          <span>{formatCurrency(pagamentos.reduce((s, p) => s + Number(p.valor), 0))}</span>
                        </div>
                        {pagamentos.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-xs py-1" style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
                            <span style={{ color: theme.text }}>
                              {formatDate(p.data)} · {p.categoria || "Sem categoria"}
                            </span>
                            <span style={{ color: theme.textMuted }}>{formatCurrency(p.valor)}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>

                  {!moto.contratoAtual && (
                    <button
                      onClick={() => setModal({ type: "contrato", moto })}
                      className="text-xs font-semibold rounded-xl px-3 py-1.5 mb-3"
                      style={{ background: theme.amber, color: theme.mintText }}
                    >
                      Alugar / novo contrato
                    </button>
                  )}

                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase tracking-wide" style={{ color: theme.textMuted }}>
                        Manutenções
                      </span>
                      <button onClick={() => setModal({ type: "manutencao", moto })} className="mbr-hover-grow" style={{ color: theme.blue }}>
                        <Plus size={14} />
                      </button>
                    </div>
                    {(moto.manutencoes || []).length === 0 ? (
                      <div style={{ color: theme.textMuted, fontSize: 12 }}>Nenhuma registrada.</div>
                    ) : (
                      [...moto.manutencoes].reverse().map((mnt) => (
                        <div key={mnt.id} className="flex items-center justify-between text-xs py-1" style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
                          <span style={{ color: theme.text }}>
                            {formatDate(mnt.data)} · {mnt.tipo}
                          </span>
                          <span style={{ color: theme.textMuted }}>{formatCurrency(mnt.valorGasto)}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase tracking-wide" style={{ color: theme.textMuted }}>
                        Custos
                      </span>
                      <button onClick={() => setModal({ type: "custoExtra", moto })} className="mbr-hover-grow" style={{ color: theme.blue }}>
                        <Plus size={14} />
                      </button>
                    </div>
                    {custosDaMoto(moto, lancamentos).length === 0 ? (
                      <div style={{ color: theme.textMuted, fontSize: 12 }}>Nenhum registrado.</div>
                    ) : (
                      [...custosDaMoto(moto, lancamentos)].reverse().map((c) => (
                        <div key={c.id} className="flex items-center justify-between text-xs py-1" style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
                          <span style={{ color: theme.text }}>
                            {formatDate(c.data)} · {c.descricao}
                          </span>
                          <span style={{ color: theme.textMuted }}>{formatCurrency(c.valorGasto)}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setModal({ type: "moto", mode: "editar", moto })}
                      className="text-xs font-semibold rounded-xl px-3 py-1.5 flex items-center gap-1"
                      style={{ border: `1px solid ${theme.cardBorder}`, color: theme.text }}
                    >
                      <Pencil size={12} /> Editar
                    </button>
                    <button
                      onClick={() => excluirMoto(moto.id)}
                      className="text-xs font-semibold rounded-xl px-3 py-1.5 flex items-center gap-1"
                      style={{ border: `1px solid ${theme.cardBorder}`, color: theme.coral }}
                    >
                      <Trash2 size={12} /> Excluir
                    </button>
                  </div>
                </div>
              </Collapse>
            </div>
          );
        })}
      </div>

      {modal?.type === "moto" && (
        <MotoFormModal
          title={modal.mode === "novo" ? "Cadastrar moto" : "Editar moto"}
          moto={modal.moto}
          onClose={() => setModal(null)}
          onSave={salvarMoto}
        />
      )}
      {modal?.type === "contrato" && (
        <ContratoModal
          moto={modal.moto}
          clientes={clientes}
          editando={modal.mode === "editar"}
          onClose={() => setModal(null)}
          onSave={(dados) => (modal.mode === "editar" ? atualizarContrato(modal.moto, dados) : confirmarContrato(modal.moto, dados))}
        />
      )}
      {modal?.type === "manutencao" && (
        <ManutencaoModal onClose={() => setModal(null)} onSave={(m) => salvarManutencao(modal.moto, m)} />
      )}
      {modal?.type === "custoExtra" && (
        <CustoExtraModal onClose={() => setModal(null)} onSave={(c) => salvarCustoExtra(modal.moto, c)} />
      )}
      {modal?.type === "consulta" && <ConsultaPlacaModal onClose={() => setModal(null)} />}
      {preview && <PdfViewer url={preview.url} title={preview.title} onClose={() => setPreview(null)} />}
    </div>
  );
}

/* ===========================================================
   FLUXO DE CAIXA
=========================================================== */
const NATUREZAS = ["Operacional", "Administrativo", "Expansão"];

function emptyLancamento() {
  return { id: uid(), data: todayISO(), tipo: "entrada", natureza: "Operacional", categoria: "", valor: "", descricao: "", forma: "", motoId: "", parcelas: 1 };
}

function LancamentoModal({ lancamento, onClose, onSave, onDelete, motos, editando }) {
  const [form, setForm] = useState({ motoId: "", parcelas: lancamento?.parcelasTotal || 1, ...lancamento });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const selecionarMoto = (id) => setForm((f) => ({ ...f, motoId: id }));

  return (
    <Modal title={editando ? "Editar lançamento" : "Novo lançamento"} onClose={onClose}>
      <div className="flex gap-2 mb-3">
        {["entrada", "saida"].map((t) => (
          <button
            key={t}
            onClick={() => setForm({ ...form, tipo: t })}
            className="flex-1 rounded-xl py-2 text-sm font-semibold"
            style={{
              background: form.tipo === t ? (t === "entrada" ? theme.mint : theme.coral) : "transparent",
              color: form.tipo === t ? theme.mintText : theme.textMuted,
              border: `1px solid ${theme.cardBorder}`,
            }}
          >
            {t === "entrada" ? "Entrada" : "Saída"}
          </button>
        ))}
      </div>

      {(motos || []).length > 0 && (
        <>
          <FieldLabel>Moto relacionada (opcional)</FieldLabel>
          <SelectField
            value={form.motoId || ""}
            onChange={(e) => selecionarMoto(e.target.value)}
            options={[
              { value: "", label: "Nenhuma / não é de uma moto específica" },
              ...motos.map((m) => ({ value: m.id, label: `${formatPlaca(m.placa)} — ${m.modelo || "modelo?"}` })),
            ]}
          />
          <div className="text-xs -mt-2 mb-3" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
            Use pra mensalidade, manutenção, combustível, despachante — qualquer gasto ou receita de uma moto específica.
          </div>
        </>
      )}

      <FieldLabel>Natureza</FieldLabel>
      <SelectField value={form.natureza} onChange={set("natureza")} options={NATUREZAS.map((n) => ({ value: n, label: n }))} />
      <FieldLabel>Categoria / descrição curta</FieldLabel>
      <input style={inputStyle} value={form.categoria} onChange={set("categoria")} placeholder="Mensalidade, manutenção, combustível..." />
      <Row2>
        <div>
          <FieldLabel>Valor (R$)</FieldLabel>
          <input type="number" step="0.01" style={inputStyle} value={form.valor} onChange={set("valor")} />
        </div>
        <div>
          <FieldLabel>Data</FieldLabel>
          <input type="date" style={inputStyle} value={form.data} onChange={set("data")} />
        </div>
      </Row2>
      <FieldLabel>Forma de pagamento (opcional)</FieldLabel>
      <input style={inputStyle} value={form.forma} onChange={set("forma")} placeholder="Pix, boleto, cartão..." />
      <FieldLabel>Parcelas</FieldLabel>
      <input
        type="number"
        min="1"
        style={inputStyle}
        value={form.parcelas}
        onChange={(e) => setForm({ ...form, parcelas: Math.max(1, Number(e.target.value) || 1) })}
      />
      {Number(form.parcelas) > 1 && (
        <div className="text-xs -mt-2 mb-3" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
          {Number(form.parcelas) > (lancamento?.parcelasTotal || 1)
            ? `Esse lançamento entra como a 1ª parcela — as outras ${Number(form.parcelas) - (lancamento?.parcelasTotal || 1)} entram automaticamente em "Contas futuras", uma por mês.`
            : `Marcado como parcela 1 de ${Number(form.parcelas)}.`}
        </div>
      )}
      <FieldLabel>Descrição (opcional)</FieldLabel>
      <input style={inputStyle} value={form.descricao} onChange={set("descricao")} />
      <div className="flex gap-2">
        <button
          onClick={() => onSave({ ...form, valor: Number(form.valor) || 0 })}
          className="flex-1 rounded-xl py-2 font-semibold mt-1"
          style={{ background: theme.mint, color: theme.mintText }}
        >
          Salvar
        </button>
        {editando && (
          <button
            onClick={onDelete}
            className="rounded-xl py-2 px-4 font-semibold mt-1"
            style={{ border: `1px solid ${theme.cardBorder}`, color: theme.coral }}
          >
            Excluir
          </button>
        )}
      </div>
    </Modal>
  );
}

function emptyFuturo() {
  return {
    id: uid(),
    tipo: "saida",
    descricao: "",
    categoria: "",
    valor: "",
    vencimento: todayISO(),
    recorrente: false,
    pago: false,
    motoId: "",
  };
}

function FuturoModal({ futuro, onClose, onSave, onDelete, editando, motos }) {
  const [form, setForm] = useState({ tipo: "saida", motoId: "", aplicarTodas: false, ...futuro });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const isEntrada = form.tipo === "entrada";

  const salvar = () => {
    const { aplicarTodas, ...base } = form;
    const valor = Number(base.valor) || 0;
    if (aplicarTodas && (motos || []).length > 0) {
      onSave(motos.map((m) => ({ ...base, id: uid(), valor, motoId: m.id })));
    } else {
      onSave({ ...base, valor });
    }
  };

  return (
    <Modal title={editando ? "Editar conta futura" : "Nova conta futura"} onClose={onClose}>
      <div className="flex gap-2 mb-3">
        {["saida", "entrada"].map((t) => (
          <button
            key={t}
            onClick={() => setForm({ ...form, tipo: t })}
            className="flex-1 rounded-xl py-2 text-sm font-semibold"
            style={{
              background: form.tipo === t ? (t === "entrada" ? theme.mint : theme.coral) : "transparent",
              color: form.tipo === t ? theme.mintText : theme.textMuted,
              border: `1px solid ${theme.cardBorder}`,
            }}
          >
            {t === "entrada" ? "Recebimento futuro" : "Conta a pagar"}
          </button>
        ))}
      </div>
      <FieldLabel>Descrição</FieldLabel>
      <input
        style={inputStyle}
        value={form.descricao}
        onChange={set("descricao")}
        placeholder={isEntrada ? "Aluguel de moto fixo, venda agendada..." : "Contabilidade, Imposto de renda..."}
      />
      <FieldLabel>Categoria (opcional)</FieldLabel>
      <input style={inputStyle} value={form.categoria} onChange={set("categoria")} placeholder="Imposto, serviço, taxa..." />
      {(motos || []).length > 0 && (
        <>
          <FieldLabel>Moto relacionada (opcional)</FieldLabel>
          <SelectField
            value={form.motoId || ""}
            onChange={(e) => setForm({ ...form, motoId: e.target.value })}
            options={[
              { value: "", label: "Nenhuma / não é de uma moto específica" },
              ...motos.map((m) => ({ value: m.id, label: `${formatPlaca(m.placa)} — ${m.modelo || "modelo?"}` })),
            ]}
          />
          {!editando && (
            <label className="flex items-center gap-2 mb-3 text-sm" style={{ color: theme.text, fontFamily: BODY_FONT }}>
              <input
                type="checkbox"
                checked={form.aplicarTodas}
                onChange={(e) => setForm({ ...form, aplicarTodas: e.target.checked })}
              />
              Aplicar a todas as motos ({motos.length}) — lança uma conta dessas pra cada moto
            </label>
          )}
        </>
      )}
      <Row2>
        <div>
          <FieldLabel>Valor (R$)</FieldLabel>
          <input type="number" step="0.01" style={inputStyle} value={form.valor} onChange={set("valor")} />
        </div>
        <div>
          <FieldLabel>Vencimento</FieldLabel>
          <input type="date" style={inputStyle} value={form.vencimento} onChange={set("vencimento")} />
        </div>
      </Row2>
      <label className="flex items-center gap-2 mb-3 text-sm" style={{ color: theme.text, fontFamily: BODY_FONT }}>
        <input type="checkbox" checked={form.recorrente} onChange={(e) => setForm({ ...form, recorrente: e.target.checked })} />
        Se repete todo mês (ex: contabilidade)
      </label>
      {!form.recorrente && (
        <label className="flex items-center gap-2 mb-3 text-sm" style={{ color: theme.text, fontFamily: BODY_FONT }}>
          <input type="checkbox" checked={form.pago} onChange={(e) => setForm({ ...form, pago: e.target.checked })} />
          {isEntrada ? "Já foi recebido" : "Já foi pago"}
        </label>
      )}
      <div className="flex gap-2">
        <button
          onClick={salvar}
          className="flex-1 rounded-xl py-2 font-semibold mt-1"
          style={{ background: theme.mint, color: theme.mintText }}
        >
          Salvar
        </button>
        {editando && (
          <button
            onClick={onDelete}
            className="rounded-xl py-2 px-4 font-semibold mt-1"
            style={{ border: `1px solid ${theme.cardBorder}`, color: theme.coral }}
          >
            Excluir
          </button>
        )}
      </div>
    </Modal>
  );
}

function FuturosView({ futuros, persist, motos, clientes }) {
  const [modal, setModal] = useState(null);

  const salvar = async (fOrLista) => {
    const lista = Array.isArray(fOrLista) ? fOrLista : [fOrLista];
    let next = [...futuros];
    lista.forEach((f) => {
      const existe = next.find((x) => x.id === f.id);
      next = existe ? next.map((x) => (x.id === f.id ? f : x)) : [...next, f];
    });
    await persist(next);
    setModal(null);
  };
  const excluir = async (id) => persist(futuros.filter((x) => x.id !== id));

  const { fixoMensalSaida, fixoMensalEntrada, avulsosPendentesSaida, avulsosPendentesEntrada, previstoSaida12Meses, previstoEntrada12Meses, saldoPrevisto12Meses } =
    totaisFuturos(futuros, motos);
  const contratos = contratosComoFuturos(motos);
  const projecao = projecaoFuturosPorMes([...futuros, ...contratos], 12);

  const recorrentes = futuros.filter((f) => f.recorrente);
  const avulsos = [...futuros.filter((f) => !f.recorrente)].sort((a, b) => (a.vencimento > b.vencimento ? 1 : -1));

  // agenda de cobrança: agrupa por dia do mês quem tem que ser cobrado — pensado pra
  // quando tiver muitas motos/clientes e ficar difícil lembrar "quem vence quando" só
  // olhando a lista corrida de contratos/recorrentes
  const cobrancasPorDia = (() => {
    const entradasRecorrentes = [...contratos, ...futuros.filter((f) => f.recorrente && f.tipo === "entrada")];
    const porDia = new Map();
    entradasRecorrentes.forEach((f) => {
      const dia = f.diaVencimento || (f.vencimento ? new Date(`${f.vencimento}T00:00:00`).getDate() : null);
      if (!dia) return;
      const moto = motos?.find((m) => m.id === f.motoId);
      const cliente = moto?.contratoAtual ? clientes?.find((c) => c.id === moto.contratoAtual.clienteId) : null;
      const item = {
        id: f.id,
        label: cliente?.nome || f.descricao || f.categoria || "Recebimento",
        sub: moto ? formatPlaca(moto.placa) : null,
        valor: Number(f.valor) || 0,
      };
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia).push(item);
    });
    return [...porDia.entries()].sort((a, b) => a[0] - b[0]);
  })();

  const FuturoRow = ({ f }) => {
    const motoLigada = motos?.find((m) => m.id === f.motoId);
    const diaDoMes = f.diaVencimento || (f.vencimento ? new Date(`${f.vencimento}T00:00:00`).getDate() : null);
    return (
    <div
      key={f.id}
      onClick={() => setModal(f)}
      className="flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer"
      style={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, opacity: f.pago ? 0.55 : 1 }}
    >
      <div>
        <div style={{ color: theme.text, fontFamily: BODY_FONT, fontWeight: 600, textDecoration: f.pago ? "line-through" : "none" }}>
          {f.descricao || "Sem descrição"}
        </div>
        <div style={{ color: theme.textMuted, fontFamily: BODY_FONT, fontSize: 12 }}>
          {f.recorrente ? `Recorrente · todo dia ${diaDoMes}` : `Vence em ${formatDate(f.vencimento)}`}
          {f.pago && (f.tipo === "entrada" ? " · Recebido" : " · Pago")}
          {motoLigada && ` · ${formatPlaca(motoLigada.placa)}`}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span style={{ color: f.tipo === "entrada" ? theme.mint : theme.coral, fontFamily: HEAD_FONT, fontSize: 16 }}>
          {f.tipo === "entrada" ? "+" : "-"} {formatCurrency(f.valor)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            excluir(f.id);
          }}
          className="mbr-hover-grow"
          style={{ color: theme.textMuted }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <button
          onClick={() => setModal(emptyFuturo())}
          className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold"
          style={{ background: theme.mint, color: theme.mintText }}
        >
          <Plus size={16} /> Nova conta futura
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-2xl p-4" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
          <div className="text-xs uppercase tracking-wide mb-1" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
            A receber (12 meses)
          </div>
          <div style={{ fontFamily: HEAD_FONT, fontSize: 20, color: theme.mint }}>{formatCurrency(previstoEntrada12Meses)}</div>
          <div className="text-xs mt-0.5" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
            fixo/mês: {formatCurrency(fixoMensalEntrada)} · avulso: {formatCurrency(avulsosPendentesEntrada)}
          </div>
        </div>
        <div className="rounded-2xl p-4" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
          <div className="text-xs uppercase tracking-wide mb-1" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
            A pagar (12 meses)
          </div>
          <div style={{ fontFamily: HEAD_FONT, fontSize: 20, color: theme.coral }}>{formatCurrency(previstoSaida12Meses)}</div>
          <div className="text-xs mt-0.5" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
            fixo/mês: {formatCurrency(fixoMensalSaida)} · avulso: {formatCurrency(avulsosPendentesSaida)}
          </div>
        </div>
        <div className="rounded-2xl p-4" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
          <div className="text-xs uppercase tracking-wide mb-1" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
            Saldo previsto (12 meses)
          </div>
          <div style={{ fontFamily: HEAD_FONT, fontSize: 20, color: saldoPrevisto12Meses >= 0 ? theme.mint : theme.coral }}>
            {formatCurrency(saldoPrevisto12Meses)}
          </div>
        </div>
      </div>

      {cobrancasPorDia.length > 0 && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
          <h3 style={{ fontFamily: HEAD_FONT, fontSize: 16, color: theme.text }} className="mb-1">
            Agenda de cobranças
          </h3>
          <div className="text-xs mb-3" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
            Todo mês, nesses dias — pra saber quem cobrar e quando.
          </div>
          <div className="flex flex-col">
            {cobrancasPorDia.map(([dia, itens], i) => (
              <div
                key={dia}
                className="flex items-start gap-3 py-2.5"
                style={{ borderTop: i === 0 ? "none" : `1px solid ${theme.cardBorder}` }}
              >
                <div
                  className="flex-shrink-0 flex items-center justify-center rounded-lg"
                  style={{ width: 38, height: 38, background: hexToRgba(theme.blue, 0.16), color: theme.blue, fontFamily: HEAD_FONT, fontWeight: 800, fontSize: 13 }}
                >
                  {String(dia).padStart(2, "0")}
                </div>
                <div className="flex-1 flex flex-col gap-1 min-w-0">
                  {itens.map((it) => (
                    <div key={it.id} className="flex items-center justify-between gap-2 text-xs" style={{ fontFamily: BODY_FONT }}>
                      <span className="truncate" style={{ color: theme.text }}>
                        {it.label}
                        {it.sub ? ` · ${it.sub}` : ""}
                      </span>
                      <span style={{ color: theme.mint, fontWeight: 700, flexShrink: 0 }}>{formatCurrency(it.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl p-4 mb-4" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
        <h3 style={{ fontFamily: HEAD_FONT, fontSize: 16, color: theme.text }} className="mb-3">
          Previsão por mês
        </h3>
        {futuros.length === 0 ? (
          <div className="text-xs" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
            Cadastre uma conta futura pra ver a previsão aqui.
          </div>
        ) : (
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={projecao} margin={{ left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.cardBorder} vertical={false} />
                <XAxis dataKey="mes" stroke={theme.textMuted} fontSize={11} axisLine={false} tickLine={false} />
                <YAxis stroke={theme.textMuted} fontSize={11} tickFormatter={formatCompact} width={56} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value, name) => [formatCurrency(value), name]}
                  contentStyle={{ background: theme.panel, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, color: theme.text }}
                />
                <Legend />
                <Bar dataKey="entrada" name="A receber" fill={theme.mint} radius={[4, 4, 0, 0]} />
                <Bar dataKey="saida" name="A pagar" fill={theme.coral} radius={[4, 4, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="saldo"
                  name="Saldo"
                  stroke={theme.amber}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: theme.amber, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {contratos.length > 0 && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
            Contratos ativos (automático)
          </div>
          <div className="flex flex-col gap-2">
            {contratos.map((f) => (
              <div key={f.id} className="flex items-center justify-between px-4 py-3 rounded-2xl" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
                <div>
                  <div style={{ color: theme.text, fontFamily: BODY_FONT, fontWeight: 600 }}>{f.descricao}</div>
                  <div style={{ color: theme.textMuted, fontFamily: BODY_FONT, fontSize: 12 }}>
                    Todo mês{f.dataTermino ? ` · até ${formatDate(f.dataTermino)}` : " · sem prazo definido"}
                  </div>
                </div>
                <span style={{ color: theme.mint, fontFamily: HEAD_FONT, fontSize: 16 }}>+ {formatCurrency(f.valor)}</span>
              </div>
            ))}
          </div>
          <div className="text-xs mt-2" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
            Vem direto dos contratos de aluguel ativos — pra editar, mude o contrato na aba Motos.
          </div>
        </div>
      )}

      {recorrentes.length > 0 && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
            Fixos mensais
          </div>
          <div className="flex flex-col gap-2">
            {recorrentes.map((f) => (
              <FuturoRow key={f.id} f={f} />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
          Avulsos
        </div>
        {avulsos.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={{ background: theme.card, color: theme.textMuted, fontFamily: BODY_FONT, border: `1px solid ${theme.cardBorder}` }}>
            Nenhuma conta avulsa cadastrada.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {avulsos.map((f) => (
              <FuturoRow key={f.id} f={f} />
            ))}
          </div>
        )}
      </div>

      {modal && (
        <FuturoModal
          futuro={modal}
          motos={motos}
          editando={futuros.some((x) => x.id === modal.id)}
          onClose={() => setModal(null)}
          onSave={salvar}
          onDelete={() => {
            excluir(modal.id);
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

function FluxoCaixaView({ lancamentos, persist, motos, clientes, futuros, persistFuturos }) {
  const [modal, setModal] = useState(null);

  const salvar = async (l) => {
    const { parcelas, ...base } = l;
    const existe = lancamentos.find((x) => x.id === base.id);
    const parcelasAntes = existe?.parcelasTotal || 1;
    const parcelasNovo = Number(parcelas) || 1;

    // guarda quantas parcelas foram usadas direto no lançamento, pra mostrar "Parcela
    // 1/3" na lista e continuar aparecendo do jeito certo se abrir pra editar de novo
    const lancamento =
      parcelasNovo > 1 ? { ...base, parcelaAtual: existe?.parcelaAtual || 1, parcelasTotal: parcelasNovo } : { ...base, parcelaAtual: undefined, parcelasTotal: undefined };

    let futurosAtualizados = futuros || [];
    let futurosMudaram = false;

    // compra parcelada — a 1ª parcela é o lançamento de hoje, as demais entram como
    // contas futuras avulsas, uma por mês. Só gera as que ainda não existem: se a pessoa
    // só reabriu e salvou de novo sem mudar o número de parcelas, não duplica nada; se
    // aumentar o número depois, gera só a diferença
    if (parcelasNovo > parcelasAntes) {
      const [ano, mes, dia] = lancamento.data.split("-").map(Number);
      const novasParcelas = [];
      for (let k = parcelasAntes + 1; k <= parcelasNovo; k++) {
        const d = new Date(ano, mes - 1 + (k - 1), dia);
        novasParcelas.push({
          id: uid(),
          tipo: lancamento.tipo,
          descricao: `${lancamento.categoria || lancamento.descricao || "Parcela"} (${k}/${parcelasNovo})`,
          categoria: lancamento.categoria,
          valor: lancamento.valor,
          vencimento: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
          recorrente: false,
          pago: false,
          motoId: lancamento.motoId || "",
          parcelaAtual: k,
          parcelasTotal: parcelasNovo,
        });
      }
      futurosAtualizados = [...futurosAtualizados, ...novasParcelas];
      futurosMudaram = true;
    }

    // 1º lançamento de um mês novo — puxa automaticamente pra "Lançado" as parcelas de
    // compras já em andamento que vencem nesse mesmo mês (ex: parcela 4/12 de uma moto
    // financiada), em vez de ficar esperando em "Futuros" pra copiar na mão todo mês
    const mesDoNovo = lancamento.data?.slice(0, 7);
    const primeiroDoMes = !existe && mesDoNovo && !lancamentos.some((x) => x.data?.slice(0, 7) === mesDoNovo);
    const promovidos = [];
    if (primeiroDoMes) {
      futurosAtualizados = futurosAtualizados.filter((f) => {
        const elegivel = !f.recorrente && !f.pago && f.parcelasTotal > 1 && f.vencimento?.slice(0, 7) === mesDoNovo;
        if (!elegivel) return true;
        promovidos.push({
          id: uid(),
          tipo: f.tipo,
          data: f.vencimento,
          natureza: "Operacional",
          categoria: f.categoria,
          descricao: f.descricao,
          forma: "",
          motoId: f.motoId || "",
          parcelaAtual: f.parcelaAtual,
          parcelasTotal: f.parcelasTotal,
        });
        return false;
      });
      if (promovidos.length > 0) futurosMudaram = true;
    }

    const next = existe ? lancamentos.map((x) => (x.id === lancamento.id ? lancamento : x)) : [...lancamentos, lancamento, ...promovidos];
    await persist(next);
    if (futurosMudaram) await persistFuturos(futurosAtualizados);
    setModal(null);
  };

  const excluir = async (id) => persist(lancamentos.filter((x) => x.id !== id));
  const ordenados = [...lancamentos].sort((a, b) => (a.data < b.data ? 1 : -1));

  const porMes = {};
  ordenados.forEach((l) => {
    const key = l.data ? l.data.slice(0, 7) : "sem-data";
    (porMes[key] = porMes[key] || []).push(l);
  });
  const mesesOrdenados = Object.keys(porMes).sort((a, b) => (a < b ? 1 : -1));

  const [expandido, setExpandido] = useState(mesesOrdenados[0] || null);
  const [view, setView] = useState("lancado");

  const viewToggleRef = useRef(null);
  const viewSlotRefs = useRef({});
  const [viewPillRect, setViewPillRect] = useState(null);

  // mesma pílula deslizante do menu de baixo, só que aqui entre "Lançado"/"Futuros" —
  // mede a posição do botão ativo e anima a faixa verde até ali em vez de simplesmente
  // trocar o fundo do botão na hora
  useEffect(() => {
    const medir = () => {
      const slot = viewSlotRefs.current[view];
      const container = viewToggleRef.current;
      if (!slot || !container) return;
      const slotRect = slot.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setViewPillRect({ left: slotRect.left - containerRect.left, top: slotRect.top - containerRect.top, width: slotRect.width, height: slotRect.height });
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [view]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 style={{ fontFamily: HEAD_FONT, fontSize: 22, fontWeight: 800, color: theme.mint }}>Fluxo de caixa</h2>
        <div className="flex items-center gap-2">
          <div ref={viewToggleRef} className="relative flex rounded-xl p-1" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
            {viewPillRect && (
              <span
                className="absolute rounded-lg"
                style={{
                  left: 0,
                  top: viewPillRect.top,
                  width: viewPillRect.width,
                  height: viewPillRect.height,
                  background: theme.mint,
                  willChange: "transform",
                  transform: `translateX(${viewPillRect.left}px)`,
                  transition: "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
                }}
              />
            )}
            {[
              { id: "lancado", label: "Lançado" },
              { id: "futuros", label: "Futuros" },
            ].map((v) => (
              <button
                key={v.id}
                ref={(el) => (viewSlotRefs.current[v.id] = el)}
                onClick={() => setView(v.id)}
                className="relative rounded-lg px-3 py-1.5 text-sm font-semibold"
                style={{
                  color: view === v.id ? theme.mintText : theme.textMuted,
                  transition: "color 0.15s ease",
                  zIndex: 1,
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
          {view === "lancado" && (
            <button
              onClick={() => setModal(emptyLancamento())}
              className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold"
              style={{ background: theme.mint, color: theme.mintText }}
            >
              <Plus size={16} /> Novo
            </button>
          )}
        </div>
      </div>

      {view === "futuros" ? (
        <FuturosView futuros={futuros || []} persist={persistFuturos} motos={motos} clientes={clientes} />
      ) : (
        <>
      {ordenados.length === 0 && (
        <div className="rounded-2xl p-6 text-center" style={{ background: theme.card, color: theme.textMuted, fontFamily: BODY_FONT, border: `1px solid ${theme.cardBorder}` }}>
          Nenhum lançamento ainda.
        </div>
      )}

      {ordenados.length > 0 && (
        <div
          className="rounded-2xl p-4 mb-3"
          style={{ background: `linear-gradient(150deg, ${theme.card} 0%, ${theme.card2} 130%)`, border: `1px solid ${theme.cardBorder}` }}
        >
          <SectionTitle color={theme.blue} className="mb-3">Resumo mensal</SectionTitle>
          <div className="flex flex-col gap-2">
            {mesesOrdenados.slice(0, 4).map((mesKey) => {
              const itensResumo = porMes[mesKey];
              const entradaResumo = itensResumo.filter((l) => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0);
              const saidaResumo = itensResumo.filter((l) => l.tipo === "saida").reduce((s, l) => s + Number(l.valor), 0);
              const saldoResumo = entradaResumo - saidaResumo;
              return (
                <div
                  key={mesKey}
                  className="rounded-xl px-3 py-2.5"
                  style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span style={{ color: theme.text, fontWeight: 800, fontFamily: HEAD_FONT, fontSize: 14 }}>
                      {mesKey === "sem-data" ? "Sem data" : monthLabel(mesKey)}
                    </span>
                    <span
                      style={{
                        color: saldoResumo >= 0 ? theme.mint : theme.coral,
                        fontWeight: 800,
                        fontFamily: BODY_FONT,
                        fontSize: 14,
                      }}
                    >
                      Saldo: {formatCurrency(saldoResumo)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap text-xs" style={{ fontFamily: BODY_FONT, color: theme.textMuted }}>
                    <span>Entradas <b style={{ color: theme.mint }}>{formatCurrency(entradaResumo)}</b></span>
                    <span>Saídas <b style={{ color: theme.coral }}>{formatCurrency(saidaResumo)}</b></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {mesesOrdenados.map((mesKey) => {
          const itens = porMes[mesKey];
          const totalEntrada = itens.filter((l) => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0);
          const totalSaida = itens.filter((l) => l.tipo === "saida").reduce((s, l) => s + Number(l.valor), 0);
          const saldo = totalEntrada - totalSaida;
          const aberto = expandido === mesKey;
          return (
            <div key={mesKey} className="rounded-2xl overflow-hidden" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                onClick={() => setExpandido(aberto ? null : mesKey)}
              >
                <div>
                  <div style={{ fontFamily: HEAD_FONT, fontSize: 16, color: theme.text }}>
                    {mesKey === "sem-data" ? "Sem data" : monthLabel(mesKey)}
                  </div>
                  <div className="text-xs" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
                    {itens.length} lançamento{itens.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ color: saldo >= 0 ? theme.mint : theme.coral, fontFamily: HEAD_FONT, fontSize: 15 }}>
                    {formatCurrency(saldo)}
                  </span>
                  {aberto ? <ChevronUp size={18} color={theme.textMuted} /> : <ChevronDown size={18} color={theme.textMuted} />}
                </div>
              </button>

              <Collapse open={aberto}>
                <div style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
                  {itens.map((l, i) => {
                    const motoLigada = motos?.find((m) => m.id === l.motoId);
                    return (
                      <div
                        key={l.id}
                        onClick={() => setModal(l)}
                        className="flex items-center justify-between px-4 py-3 cursor-pointer"
                        style={{
                          background: theme.card2,
                          borderBottom: i < itens.length - 1 ? `1px solid ${theme.cardBorder}` : "none",
                        }}
                      >
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span style={{ color: theme.text, fontFamily: BODY_FONT, fontWeight: 600 }}>{l.categoria || "Sem categoria"}</span>
                            {l.parcelasTotal > 1 && (
                              <span
                                className="text-xs font-semibold rounded-full px-2"
                                style={{ background: hexToRgba(theme.blue, 0.16), color: theme.blue, fontFamily: BODY_FONT }}
                              >
                                Parcela {l.parcelaAtual || 1}/{l.parcelasTotal}
                              </span>
                            )}
                          </div>
                          <div style={{ color: theme.textMuted, fontFamily: BODY_FONT, fontSize: 12 }}>
                            {formatDate(l.data)}
                            {l.natureza && ` · ${l.natureza}`}
                            {l.forma && ` · ${l.forma}`}
                            {l.descricao ? ` · ${l.descricao}` : ""}
                            {motoLigada && ` · ${formatPlaca(motoLigada.placa)}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span style={{ color: l.tipo === "entrada" ? theme.mint : theme.coral, fontFamily: HEAD_FONT, fontSize: 16 }}>
                            {l.tipo === "entrada" ? "+" : "-"} {formatCurrency(l.valor)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              excluir(l.id);
                            }}
                            className="mbr-hover-grow"
                            style={{ color: theme.textMuted }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Collapse>
            </div>
          );
        })}
      </div>

      {modal && (
        <LancamentoModal
          lancamento={modal}
          editando={lancamentos.some((x) => x.id === modal.id)}
          onClose={() => setModal(null)}
          onSave={salvar}
          onDelete={() => {
            excluir(modal.id);
            setModal(null);
          }}
          motos={motos}
        />
      )}
        </>
      )}
    </div>
  );
}

/* ===========================================================
   DASHBOARD
=========================================================== */
// anima o conteúdo aparecendo (fade + subir) só quando ele entra na tela ao rolar —
// dá aquele efeito de "site vivo" conforme você desce a página, sem custar nada em telas menores
function Reveal({ children, delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(26px)",
        transition: `opacity 0.55s ease ${delay}ms, transform 0.55s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// título de seção com um traço colorido do lado — dá um toque de cor variando por
// painel, em vez de todo título ficar no mesmo tom neutro
function SectionTitle({ color = theme.mint, className = "mb-3", children }) {
  return (
    <h3 className={`flex items-center gap-2 ${className}`} style={{ fontFamily: HEAD_FONT, fontSize: 16, color: theme.text }}>
      <span style={{ width: 4, height: 16, borderRadius: 2, background: color, boxShadow: `0 0 8px ${color}77`, flexShrink: 0 }} />
      {children}
    </h3>
  );
}

// anima um número subindo do valor anterior até o novo (efeito "contador") sempre que
// `value` muda — dá vida aos números do dashboard sem precisar animar nada além do texto
function CountUp({ value, format, duration = 900 }) {
  const to = Number(value) || 0;
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const firstRef = useRef(true);

  useEffect(() => {
    const from = firstRef.current ? 0 : fromRef.current;
    firstRef.current = false;
    if (reduceMotion() || from === to) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    let raf = requestAnimationFrame(tick);
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      setDisplay(from + (to - from) * ease(t));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, duration]);

  return <>{format ? format(display) : Math.round(display)}</>;
}

function HeroStat({ label, value, format = formatCurrency, icon: Icon, accent, deltaPercent, deltaLabel, sparkData, fill }) {
  const hasDelta = deltaPercent !== null && deltaPercent !== undefined && Number.isFinite(deltaPercent);
  return (
    <div
      className={`rounded-2xl p-5 flex flex-col gap-2 min-w-0 mbr-card-lift${fill ? " h-full" : ""}`}
      style={{
        background: `linear-gradient(150deg, ${theme.card} 0%, ${theme.card2} 130%)`,
        border: `1px solid ${accent}55`,
        boxShadow: `0 2px 12px rgba(0,0,0,0.22), 0 0 28px ${accent}1F`,
      }}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-xs uppercase tracking-wide truncate" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
          {label}
        </span>
        <div
          className="rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            width: 30,
            height: 30,
            background: `linear-gradient(150deg, ${accent}3D 0%, ${accent}14 100%)`,
            boxShadow: `0 0 12px ${accent}33`,
          }}
        >
          <Icon size={15} color={accent} />
        </div>
      </div>
      <span
        style={{
          fontFamily: HEAD_FONT,
          fontSize: "clamp(18px, 6vw, 28px)",
          fontWeight: 800,
          backgroundImage: `linear-gradient(120deg, ${theme.text} 30%, ${accent} 145%)`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: theme.text,
          lineHeight: 1.15,
          wordBreak: "break-word",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <CountUp value={value} format={format} />
      </span>
      {hasDelta && (
        <span className="text-xs font-semibold flex items-center gap-1" style={{ color: deltaPercent >= 0 ? theme.mint : theme.coral, fontFamily: BODY_FONT }}>
          {deltaPercent >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(deltaPercent).toFixed(0)}% {deltaLabel}
        </span>
      )}
      {sparkData && sparkData.length > 1 && (
        <div style={{ flex: 1, minHeight: 46, marginTop: 4 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="mbrSparkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={accent} strokeWidth={2} fill="url(#mbrSparkFill)" isAnimationActive={true} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function RadialStat({ label, percent, color, sublabel, bare }) {
  const clamped = Math.max(0, Math.min(100, percent || 0));
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  return (
    <div
      className={bare ? "flex items-center gap-3 min-w-0" : "rounded-2xl p-5 flex items-center gap-3 min-w-0 mbr-card-lift"}
      style={
        bare
          ? {}
          : {
              background: `linear-gradient(150deg, ${theme.card} 0%, ${theme.card2} 130%)`,
              border: `1px solid ${color}55`,
              boxShadow: `0 2px 12px rgba(0,0,0,0.22), 0 0 28px ${color}1F`,
            }
      }
    >
      <svg width={64} height={64} viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
        <circle cx="32" cy="32" r={r} fill="none" stroke={theme.cardBorder} strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 32 32)"
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
        <text x="32" y="37" textAnchor="middle" fontSize="14" fontWeight="700" fill={theme.text} style={{ fontFamily: HEAD_FONT }}>
          <CountUp value={clamped} format={(v) => `${Math.round(v)}%`} />
        </text>
      </svg>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs uppercase tracking-wide" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
          {label}
        </span>
        {sublabel && (
          <span className="text-xs" style={{ color: theme.text, fontFamily: BODY_FONT }}>
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

function DashboardView({ motos, lancamentos, clientes, futuros }) {
  const alugadas = motos.filter((m) => m.status === "alugada").length;
  const disponiveis = motos.filter((m) => m.status === "disponivel").length;
  const motosVencidas = motos.filter((m) => m.status === "alugada" && isContratoVencido(m.contratoAtual));
  const vencidas = motosVencidas.length;

  const todasManutencoes = motos.flatMap((m) => m.manutencoes || []);

  const now = new Date();
  const mesCalendario = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const mesesComDados = new Set(
    [...lancamentos.map((l) => l.data?.slice(0, 7)), ...todasManutencoes.map((m) => m.data?.slice(0, 7))].filter(Boolean)
  );
  // usa o mês atual se ele já tiver algum lançamento; senão, cai pro mês mais recente com dados
  // (evita mostrar "Lucro do mês" zerado só porque ainda não lançou nada no mês corrente) —
  // mas o usuário pode escolher outro mês pra olhar pelo seletor no topo da tela
  const mesAutoDetectado = mesesComDados.has(mesCalendario) ? mesCalendario : [...mesesComDados].sort().pop() || mesCalendario;
  const [mesEscolhido, setMesEscolhido] = useState(null);
  const mesRef = mesEscolhido || mesAutoDetectado;
  const podeAvancarMes = mesRef < mesCalendario;
  const [direcaoMes, setDirecaoMes] = useState(0); // -1 = voltou, 1 = avançou
  const irParaMesAnteriorRef = () => {
    setDirecaoMes(-1);
    const [ano, mesN] = mesRef.split("-").map(Number);
    const d = new Date(ano, mesN - 2, 1);
    setMesEscolhido(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const irParaProximoMesRef = () => {
    if (!podeAvancarMes) return;
    setDirecaoMes(1);
    const [ano, mesN] = mesRef.split("-").map(Number);
    const d = new Date(ano, mesN, 1);
    setMesEscolhido(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const noMes = (data) => data?.slice(0, 7) === mesRef;
  const rotuloMes = monthLabel(mesRef);

  // guarda o rótulo do mês anterior por um instante pra poder animar ele "saindo" pro
  // lado enquanto o novo mês "entra" do lado oposto, feito um carrossel
  const rotuloMesAtualRef = useRef(rotuloMes);
  const [rotuloMesSaindo, setRotuloMesSaindo] = useState(null);
  useEffect(() => {
    if (rotuloMesAtualRef.current !== rotuloMes) {
      setRotuloMesSaindo(rotuloMesAtualRef.current);
      rotuloMesAtualRef.current = rotuloMes;
      const t = setTimeout(() => setRotuloMesSaindo(null), 320);
      return () => clearTimeout(t);
    }
  }, [rotuloMes]);

  const entradasMes = lancamentos.filter((l) => l.tipo === "entrada" && noMes(l.data)).reduce((s, l) => s + Number(l.valor), 0);
  const saidasOperacionaisMes = lancamentos
    .filter((l) => l.tipo === "saida" && l.natureza !== "Expansão" && noMes(l.data))
    .reduce((s, l) => s + Number(l.valor), 0);
  const manutencaoMes = todasManutencoes.filter((m) => noMes(m.data)).reduce((s, m) => s + Number(m.valorGasto), 0);
  const saidasMes = saidasOperacionaisMes + manutencaoMes;
  const lucroMes = entradasMes - saidasMes;
  const margemLucro = entradasMes > 0 ? (lucroMes / entradasMes) * 100 : 0;

  const [refAno, refMesNum] = mesRef.split("-").map(Number);

  // nunca mostra meses anteriores ao primeiro lançamento — a empresa não existia ainda
  const mesesOrdenadosComDados = [...mesesComDados].sort();
  const primeiroMesComDados = mesesOrdenadosComDados[0] || mesRef;
  const [anoIni, mesIni] = primeiroMesComDados.split("-").map(Number);
  const inicioAbs = anoIni * 12 + (mesIni - 1);
  const fimAbs = refAno * 12 + (refMesNum - 1);
  const mesesDisponiveis = fimAbs - inicioAbs + 1;

  const [periodoGrafico, setPeriodoGrafico] = useState("tudo"); // "3m" | "6m" | "12m" | "tudo"
  const periodoToggleRef = useRef(null);
  const periodoSlotRefs = useRef({});
  const [periodoPillRect, setPeriodoPillRect] = useState(null);

  // mesma pílula deslizante do menu de baixo, agora no seletor 3m/6m/12m/Tudo do gráfico
  useEffect(() => {
    const medir = () => {
      const slot = periodoSlotRefs.current[periodoGrafico];
      const container = periodoToggleRef.current;
      if (!slot || !container) return;
      const slotRect = slot.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setPeriodoPillRect({ left: slotRect.left - containerRect.left, top: slotRect.top - containerRect.top, width: slotRect.width, height: slotRect.height });
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [periodoGrafico]);

  const [mostrarInvestimentos, setMostrarInvestimentos] = useState(false);
  // pra sumir com uma transição em vez de desaparecer seco: continua montada mais um
  // instante enquanto a opacidade vai a zero, só desmonta de fato depois
  const [investMontada, setInvestMontada] = useState(false);
  const [investOpaca, setInvestOpaca] = useState(false);
  const idRef2 = useRef(null);
  useEffect(() => {
    if (mostrarInvestimentos) {
      setInvestMontada(true);
      // dois rAF em sequência garantem que o navegador realmente pintou um quadro com
      // a opacidade em 0 antes de mudar pra 1 — só com um, às vezes as duas mudanças
      // de estado caem no mesmo commit e a transição de CSS nunca chega a "disparar"
      const id1 = requestAnimationFrame(() => {
        const id2 = requestAnimationFrame(() => setInvestOpaca(true));
        idRef2.current = id2;
      });
      return () => {
        cancelAnimationFrame(id1);
        if (idRef2.current) cancelAnimationFrame(idRef2.current);
      };
    }
    setInvestOpaca(false);
    const t = setTimeout(() => setInvestMontada(false), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarInvestimentos]);
  const [verTodasRetorno, setVerTodasRetorno] = useState(false);
  const [valoresOcultos, setValoresOcultos] = useState(false);
  const fmt = valoresOcultos ? () => "R$ ••••••" : formatCurrency;
  const fmtCompact = valoresOcultos ? () => "•••" : formatCompact;

  const qtdMesesAlvo = { "3m": 3, "6m": 6, "12m": 12, tudo: mesesDisponiveis }[periodoGrafico] || mesesDisponiveis;
  const qtdMeses = Math.max(1, Math.min(qtdMesesAlvo, mesesDisponiveis));

  const meses = [];
  for (let i = qtdMeses - 1; i >= 0; i--) {
    const abs = fimAbs - i;
    const ano = Math.floor(abs / 12);
    const mesN = (abs % 12) + 1;
    meses.push(`${ano}-${String(mesN).padStart(2, "0")}`);
  }
  const chartData = meses.map((key) => {
    const doMesX = lancamentos.filter((l) => l.data?.slice(0, 7) === key);
    const manut = todasManutencoes.filter((m) => m.data?.slice(0, 7) === key).reduce((s, m) => s + Number(m.valorGasto), 0);
    const entradasDoMes = doMesX.filter((l) => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0);
    const saidasDoMes = doMesX.filter((l) => l.tipo === "saida" && l.natureza !== "Expansão").reduce((s, l) => s + Number(l.valor), 0) + manut;
    return {
      mes: monthLabel(key),
      Entradas: entradasDoMes,
      Saídas: saidasDoMes,
      Investimentos: doMesX.filter((l) => l.tipo === "saida" && l.natureza === "Expansão").reduce((s, l) => s + Number(l.valor), 0),
      Lucro: entradasDoMes - saidasDoMes,
    };
  });

  // mini-gráfico de tendência do faturamento — sempre os últimos meses com dados,
  // independente do filtro (3m/6m/12m/tudo) escolhido pro gráfico principal
  const sparkMeses = Math.min(6, mesesDisponiveis);
  const sparkFaturamento = Array.from({ length: sparkMeses }, (_, i) => {
    const abs = fimAbs - (sparkMeses - 1 - i);
    const ano = Math.floor(abs / 12);
    const mesN = (abs % 12) + 1;
    const key = `${ano}-${String(mesN).padStart(2, "0")}`;
    const v = lancamentos.filter((l) => l.tipo === "entrada" && l.data?.slice(0, 7) === key).reduce((s, l) => s + Number(l.valor), 0);
    return { v };
  });

  const porNatureza = NATUREZAS.map((n) => ({
    natureza: n,
    total: lancamentos.filter((l) => l.tipo === "saida" && l.natureza === n).reduce((s, l) => s + Number(l.valor), 0),
  }));
  const maxNatureza = Math.max(1, ...porNatureza.map((n) => n.total));

  const clienteNome = (id) => clientes?.find((c) => c.id === id)?.nome || "Cliente";
  const taxaOcupacao = motos.length ? Math.round((alugadas / motos.length) * 100) : 0;
  const contratosAtivos = motos.filter((m) => m.contratoAtual);
  const faturamentoPrevisto = contratosAtivos.reduce((s, m) => s + Number(m.contratoAtual.valorMensal || 0), 0);
  const ticketMedio = contratosAtivos.length ? faturamentoPrevisto / contratosAtivos.length : 0;
  const investimentoFrota = motos.reduce((s, m) => s + Number(m.valorCompra || 0), 0);

  const rankingManutencao = motos
    .map((m) => ({ placa: m.placa, modelo: m.modelo, total: (m.manutencoes || []).reduce((s, x) => s + Number(x.valorGasto || 0), 0) }))
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
  const maxManutencao = Math.max(1, ...rankingManutencao.map((m) => m.total));

  const rankingFaturamento = motos
    .filter((m) => m.contratoAtual)
    .map((m) => ({ placa: m.placa, total: Number(m.contratoAtual.valorMensal || 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const maxFaturamentoMoto = Math.max(1, ...rankingFaturamento.map((m) => m.total));

  // retorno do investimento por moto — quanto já foi "recuperado" (estimado a partir do
  // valor mensal do contrato x meses decorridos) vs quanto custou (compra + custos extras + manutenção)
  const retornoPorMoto = motos
    .map((m) => {
      const custosExtrasTotal = custosDaMoto(m, lancamentos).reduce((s, c) => s + Number(c.valorGasto || 0), 0);
      const manutencaoTotal = (m.manutencoes || []).reduce((s, x) => s + Number(x.valorGasto || 0), 0);
      const investimentoTotal = Number(m.valorCompra || 0) + custosExtrasTotal + manutencaoTotal;
      const receitaMensal = m.contratoAtual ? Number(m.contratoAtual.valorMensal || 0) : 0;

      // recebido de verdade — soma os lançamentos de entrada que citam a placa dessa moto
      // (é assim que o fluxo de caixa já é lançado, ex: "Mensalidade URB5I50")
      const recebidoReal = pagamentosDaMoto(m, lancamentos).reduce((s, p) => s + Number(p.valor), 0);
      const restante = Math.max(0, investimentoTotal - recebidoReal);
      const mesesRestantes = receitaMensal > 0 ? Math.ceil(restante / receitaMensal) : null;
      const percentPago = investimentoTotal > 0 ? Math.min(100, (recebidoReal / investimentoTotal) * 100) : 0;

      return { placa: m.placa, investimentoTotal, recebidoReal, receitaMensal, percentPago, mesesRestantes, jaPagou: restante <= 0 && investimentoTotal > 0 };
    })
    .filter((r) => r.investimentoTotal > 0)
    .sort((a, b) => b.percentPago - a.percentPago);

  // mês anterior ao mês de referência — usado só pra calcular a variação (%) dos KPIs principais
  const mesAnteriorKey = (() => {
    const d = new Date(refAno, refMesNum - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const noMesAnterior = (data) => data?.slice(0, 7) === mesAnteriorKey;
  const entradasMesAnterior = lancamentos.filter((l) => l.tipo === "entrada" && noMesAnterior(l.data)).reduce((s, l) => s + Number(l.valor), 0);
  const saidasOperacionaisMesAnterior = lancamentos
    .filter((l) => l.tipo === "saida" && l.natureza !== "Expansão" && noMesAnterior(l.data))
    .reduce((s, l) => s + Number(l.valor), 0);
  const manutencaoMesAnterior = todasManutencoes.filter((m) => noMesAnterior(m.data)).reduce((s, m) => s + Number(m.valorGasto), 0);
  const lucroMesAnterior = entradasMesAnterior - (saidasOperacionaisMesAnterior + manutencaoMesAnterior);
  const deltaFaturamento = entradasMesAnterior > 0 ? ((entradasMes - entradasMesAnterior) / entradasMesAnterior) * 100 : null;
  const deltaLucro = lucroMesAnterior !== 0 ? ((lucroMes - lucroMesAnterior) / Math.abs(lucroMesAnterior)) * 100 : null;
  const rotuloMesAnterior = monthLabel(mesAnteriorKey);

  const totalClientes = clientes?.length || 0;
  const faturamentoAcumulado = lancamentos.filter((l) => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0);
  const manutencaoAcumulada = todasManutencoes.reduce((s, m) => s + Number(m.valorGasto || 0), 0);
  const contratosEncerrados = motos.reduce((s, m) => s + (m.historicoContratos?.length || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <h2 style={{ fontFamily: HEAD_FONT, fontSize: 22, fontWeight: 800, color: theme.mint }}>Visão geral</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setValoresOcultos((v) => !v)}
            className="mbr-hover-grow flex items-center justify-center rounded-full"
            title={valoresOcultos ? "Mostrar valores" : "Ocultar valores"}
            style={{ width: 34, height: 34, background: theme.card, border: `1px solid ${theme.cardBorder}`, color: theme.text }}
          >
            {valoresOcultos ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <div className="flex items-center gap-1 rounded-full px-1.5 py-1" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
            <button onClick={irParaMesAnteriorRef} className="mbr-hover-grow flex items-center justify-center rounded-full" style={{ width: 26, height: 26, color: theme.text }}>
              <ChevronLeft size={16} />
            </button>
            <span className="relative inline-block overflow-hidden align-middle" style={{ minWidth: 74, height: 15 }}>
              {rotuloMesSaindo && (
                <span
                  key={`saindo-${rotuloMesSaindo}`}
                  className="absolute inset-0 text-xs font-semibold text-center"
                  style={{
                    color: theme.text,
                    fontFamily: BODY_FONT,
                    animation: `${direcaoMes >= 0 ? "mbrMesSaiEsquerda" : "mbrMesSaiDireita"} 0.32s cubic-bezier(0.32, 0.72, 0, 1) both`,
                  }}
                >
                  {rotuloMesSaindo}
                </span>
              )}
              <span
                key={`entra-${rotuloMes}`}
                className="absolute inset-0 text-xs font-semibold text-center"
                style={{
                  color: theme.text,
                  fontFamily: BODY_FONT,
                  animation: rotuloMesSaindo ? `${direcaoMes >= 0 ? "mbrMesEntraDireita" : "mbrMesEntraEsquerda"} 0.32s cubic-bezier(0.32, 0.72, 0, 1) both` : "none",
                }}
              >
                {rotuloMes}
              </span>
            </span>
            <button
              onClick={irParaProximoMesRef}
              disabled={!podeAvancarMes}
              className={podeAvancarMes ? "mbr-hover-grow flex items-center justify-center rounded-full" : "flex items-center justify-center rounded-full"}
              style={{ width: 26, height: 26, color: podeAvancarMes ? theme.text : theme.textMuted, opacity: podeAvancarMes ? 1 : 0.4, cursor: podeAvancarMes ? "pointer" : "default" }}
            >
              <ChevronRight size={16} />
            </button>
            {mesEscolhido && (
              <button
                onClick={() => setMesEscolhido(null)}
                className="text-xs font-semibold rounded-full px-2 py-1 ml-1"
                style={{ background: hexToRgba(theme.mint, 0.16), color: theme.mint, fontFamily: BODY_FONT }}
              >
                Atual
              </button>
            )}
          </div>
        </div>
      </div>

      {vencidas > 0 && (
        <div className="rounded-2xl p-4 mb-4 mbr-card-lift" style={{ background: `${theme.coral}1F`, border: `1px solid ${theme.coral}` }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} color={theme.coral} />
            <span style={{ fontFamily: HEAD_FONT, fontSize: 15, color: theme.text }}>
              {vencidas === 1 ? "1 contrato vencido" : `${vencidas} contratos vencidos`}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {motosVencidas.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-xs" style={{ fontFamily: BODY_FONT, color: theme.textMuted }}>
                <span>
                  {formatPlaca(m.placa)} · {clienteNome(m.contratoAtual.clienteId)}
                </span>
                <span style={{ color: theme.coral }}>vence todo dia {diaVencimentoDoContrato(m.contratoAtual)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs principais — Faturamento vira um card alto com mini-gráfico, e Lucro +
          Margem se completam empilhados do lado, formando a mesma altura */}
      <Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-[1.3fr_1fr] gap-3 mb-3">
          <HeroStat
            label={`Faturamento (${rotuloMes})`}
            value={entradasMes}
            format={fmt}
            icon={TrendingUp}
            accent={theme.mint}
            deltaPercent={deltaFaturamento}
            deltaLabel={`vs ${rotuloMesAnterior}`}
            sparkData={sparkFaturamento}
            fill
          />
          <div className="grid grid-rows-2 gap-3">
            <HeroStat
              label={`${lucroMes >= 0 ? "Lucro" : "Prejuízo"} (${rotuloMes})`}
              value={Math.abs(lucroMes)}
              format={fmt}
              icon={Wallet}
              accent={lucroMes >= 0 ? theme.mint : theme.coral}
              deltaPercent={deltaLucro}
              deltaLabel={`vs ${rotuloMesAnterior}`}
              fill
            />
            <RadialStat
              label={`Margem de lucro (${rotuloMes})`}
              percent={margemLucro}
              color={lucroMes >= 0 ? theme.mint : theme.coral}
              sublabel={entradasMes > 0 ? `${margemLucro.toFixed(1)}%` : "sem faturamento"}
            />
          </div>
        </div>
      </Reveal>
      {!mesEscolhido && mesRef !== mesCalendario && (
        <div className="text-xs mb-3" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
          Ainda não há lançamentos em {monthLabel(mesCalendario)} — mostrando o último mês com movimento.
        </div>
      )}

      {/* Indicadores secundários — grade fixa (2 colunas no celular), pra não quebrar torto */}
      <Reveal delay={80}>
        <div
          className="rounded-2xl mb-3 p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mbr-card-lift"
          style={{ background: `linear-gradient(150deg, ${theme.card} 0%, ${theme.card2} 130%)`, border: `1px solid ${theme.cardBorder}` }}
        >
          {[
            { icon: TrendingUp, label: "Faturamento previsto/mês", value: faturamentoPrevisto, format: fmt, accent: theme.blue },
            { icon: TrendingDown, label: `Gastos operacionais (${rotuloMes})`, value: saidasMes, format: fmt, accent: theme.coral },
            { icon: Wallet, label: "Ticket médio", value: ticketMedio, format: fmt, accent: theme.mint },
            { icon: Users, label: "Total de clientes", value: totalClientes, accent: theme.amber },
            { icon: TrendingUp, label: "Investido em frota", value: investimentoFrota, format: fmt, accent: theme.blue },
            { icon: Wallet, label: "Faturamento acumulado", value: faturamentoAcumulado, format: fmt, accent: theme.mint },
            { icon: Wrench, label: "Manutenção acumulada", value: manutencaoAcumulada, format: fmt, accent: theme.coral },
            { icon: FileText, label: "Contratos encerrados", value: contratosEncerrados, accent: theme.amber },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 min-w-0">
              <div
                className="rounded-full flex items-center justify-center flex-shrink-0"
                style={{ width: 30, height: 30, background: `linear-gradient(150deg, ${s.accent}3D 0%, ${s.accent}14 100%)` }}
              >
                <s.icon size={14} color={s.accent} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs truncate" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
                  {s.label}
                </span>
                <span style={{ fontFamily: HEAD_FONT, fontWeight: 700, fontSize: 14, color: theme.text }}>
                  <CountUp value={s.value} format={s.format} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Status da frota — anel + números, um card só */}
      <Reveal delay={140}>
        <div
          className="rounded-2xl p-4 mb-4 flex items-center gap-5 flex-wrap mbr-card-lift"
          style={{ background: `linear-gradient(150deg, ${theme.card} 0%, ${theme.card2} 130%)`, border: `1px solid ${theme.cardBorder}` }}
        >
          <RadialStat bare label="Taxa de ocupação" percent={taxaOcupacao} color={theme.amber} sublabel={`${alugadas} de ${motos.length} motos`} />
          <div className="flex-1 grid grid-cols-4 gap-2 min-w-[220px]" style={{ borderLeft: `1px solid ${theme.cardBorder}`, paddingLeft: 16 }}>
            {[
              { label: "Motos", value: motos.length, color: theme.text },
              { label: "Alugadas", value: alugadas, color: theme.amber },
              { label: "Disponíveis", value: disponiveis, color: theme.mint },
              { label: "Vencidos", value: vencidas, color: vencidas > 0 ? theme.coral : theme.textMuted },
            ].map((it) => (
              <div key={it.label} className="min-w-0">
                <div style={{ fontFamily: HEAD_FONT, fontSize: 19, fontWeight: 700, color: it.color }}>
                  <CountUp value={it.value} />
                </div>
                <div className="text-xs truncate" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
                  {it.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <div className={retornoPorMoto.length > 0 ? "grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-3 mb-4" : ""}>
      <Reveal delay={0}>
      <div className={`rounded-2xl p-4 mbr-card-lift ${retornoPorMoto.length > 0 ? "" : "mb-4"}`} style={{ background: `linear-gradient(150deg, ${theme.card} 0%, ${theme.card2} 130%)`, border: `1px solid ${theme.cardBorder}` }}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <SectionTitle color={theme.mint} className="">Entradas, saídas e lucro</SectionTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div ref={periodoToggleRef} className="relative flex rounded-full overflow-hidden" style={{ border: `1px solid ${theme.cardBorder}` }}>
              {periodoPillRect && (
                <span
                  className="absolute rounded-full"
                  style={{
                    left: 0,
                    top: periodoPillRect.top,
                    width: periodoPillRect.width,
                    height: periodoPillRect.height,
                    background: theme.mint,
                    willChange: "transform",
                    transform: `translateX(${periodoPillRect.left}px)`,
                    transition: "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
                  }}
                />
              )}
              {[
                { id: "3m", label: "3m" },
                { id: "6m", label: "6m" },
                { id: "12m", label: "12m" },
                { id: "tudo", label: "Tudo" },
              ].map((op) => (
                <button
                  key={op.id}
                  ref={(el) => (periodoSlotRefs.current[op.id] = el)}
                  onClick={() => setPeriodoGrafico(op.id)}
                  className="relative text-xs font-semibold px-2.5 py-1"
                  style={{
                    color: periodoGrafico === op.id ? theme.mintText : theme.textMuted,
                    transition: "color 0.15s ease",
                    zIndex: 1,
                  }}
                >
                  {op.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setMostrarInvestimentos((v) => !v)}
              className="text-xs font-semibold rounded-full px-2.5 py-1"
              style={{
                border: `1px solid ${theme.cardBorder}`,
                background: mostrarInvestimentos ? hexToRgba(theme.blue, 0.18) : "transparent",
                color: mostrarInvestimentos ? theme.blue : theme.textMuted,
              }}
            >
              Investimentos
            </button>
          </div>
        </div>
        <div className="flex gap-4 mb-3 text-xs flex-wrap" style={{ fontFamily: BODY_FONT }}>
          <span style={{ color: theme.mint }}>Entradas no período: {fmt(chartData.reduce((s, d) => s + d.Entradas, 0))}</span>
          <span style={{ color: theme.coral }}>Saídas no período: {fmt(chartData.reduce((s, d) => s + d.Saídas, 0))}</span>
          {investMontada && (
            <span style={{ color: theme.blue, opacity: investOpaca ? 1 : 0, transition: "opacity 0.3s ease" }}>
              Investido no período: {fmt(chartData.reduce((s, d) => s + d.Investimentos, 0))}
            </span>
          )}
        </div>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="mbrGradEntradas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.mint} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={theme.mint} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mbrGradSaidas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.coral} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={theme.coral} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mbrGradInvest" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.blue} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={theme.blue} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mbrGradLucro" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.amber} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={theme.amber} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.cardBorder} vertical={false} />
              <XAxis dataKey="mes" stroke={theme.textMuted} fontSize={12} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" stroke={theme.textMuted} fontSize={11} tickFormatter={fmtCompact} width={56} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke={theme.amber}
                fontSize={11}
                tickFormatter={fmtCompact}
                width={56}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value, name) => [fmt(value), name]}
                contentStyle={{ background: theme.panel, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, color: theme.text }}
              />
              <Legend />
              {/* Lucro vem PRIMEIRO (mais embaixo na pilha de desenho) porque usa uma escala
                  (eixo direito) diferente da de Entradas/Saídas — o "zero" dele cai numa
                  altura de tela diferente do de Entradas/Saídas, então o preenchimento dele
                  podia acabar desenhado por cima da LINHA das outras duas (não só do fundo).
                  Desenhando-o antes, Entradas e Saídas sempre ficam por cima, nunca tampadas. */}
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="Lucro"
                // sem isso, quando o lucro fica negativo o preenchimento "inverte" e
                // aparece ACIMA da linha (a área é sempre calculada até o zero, então em
                // valores negativos ela sobe em vez de descer) — com baseValue="dataMin"
                // o preenchimento sempre vai da linha até o menor valor do gráfico,
                // ficando sempre por baixo, nunca por cima
                baseValue="dataMin"
                stroke={theme.amber}
                strokeWidth={2.5}
                fill="url(#mbrGradLucro)"
                dot={{ r: 3, fill: theme.amber, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="Entradas"
                stroke={theme.mint}
                strokeWidth={2.5}
                fill="url(#mbrGradEntradas)"
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="Saídas"
                stroke={theme.coral}
                strokeWidth={2.5}
                fill="url(#mbrGradSaidas)"
                dot={false}
                activeDot={{ r: 4 }}
              />
              {investMontada && (
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="Investimentos"
                  stroke={theme.blue}
                  strokeWidth={2.5}
                  fill="url(#mbrGradInvest)"
                  strokeOpacity={investOpaca ? 1 : 0}
                  fillOpacity={investOpaca ? 1 : 0}
                  style={{ transition: "fill-opacity 0.3s ease, stroke-opacity 0.3s ease" }}
                  isAnimationActive={false}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      </Reveal>

      {retornoPorMoto.length > 0 && (
        <Reveal delay={40}>
          <div className="rounded-2xl p-4 mbr-card-lift h-full flex flex-col" style={{ background: `linear-gradient(150deg, ${theme.card} 0%, ${theme.card2} 130%)`, border: `1px solid ${theme.cardBorder}` }}>
            <div className="flex items-center justify-between mb-1">
              <SectionTitle color={theme.amber} className="">Retorno do investimento por moto</SectionTitle>
              {retornoPorMoto.length > 8 && (
                <button
                  onClick={() => setVerTodasRetorno((v) => !v)}
                  className="text-xs font-semibold flex-shrink-0"
                  style={{ color: theme.amber, fontFamily: BODY_FONT }}
                >
                  {verTodasRetorno ? "Ver menos" : `Ver mais (${retornoPorMoto.length - 8})`}
                </button>
              )}
            </div>
            <div className="flex-1 flex flex-wrap content-center justify-center gap-6 mt-3">
              {(verTodasRetorno ? retornoPorMoto : retornoPorMoto.slice(0, 8)).map((r) => {
                const clamped = Math.max(0, Math.min(100, r.percentPago));
                const raio = 34;
                const c = 2 * Math.PI * raio;
                const offset = c - (clamped / 100) * c;
                const cor = r.jaPagou ? theme.mint : theme.amber;
                const legenda = r.jaPagou ? "Pago" : r.mesesRestantes != null ? `~${r.mesesRestantes}m` : "—";
                return (
                  <div
                    key={r.placa}
                    className="flex flex-col items-center gap-1"
                    style={{ width: 88 }}
                    title={valoresOcultos ? undefined : `${formatCurrency(r.recebidoReal)} de ${formatCurrency(r.investimentoTotal)}`}
                  >
                    <svg width={84} height={84} viewBox="0 0 84 84">
                      <circle cx="42" cy="42" r={raio} fill="none" stroke={theme.cardBorder} strokeWidth="7" />
                      <circle
                        cx="42"
                        cy="42"
                        r={raio}
                        fill="none"
                        stroke={cor}
                        strokeWidth="7"
                        strokeLinecap="round"
                        strokeDasharray={c}
                        strokeDashoffset={offset}
                        transform="rotate(-90 42 42)"
                        style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)" }}
                      />
                      <text x="42" y="48" textAnchor="middle" fontSize="16" fontWeight="700" fill={theme.text} style={{ fontFamily: HEAD_FONT }}>
                        <CountUp value={clamped} format={(v) => `${Math.round(v)}%`} />
                      </text>
                    </svg>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: theme.text, transition: "color 0.15s ease" }}>
                      {formatPlaca(r.placa)}
                    </span>
                    <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: BODY_FONT }}>{legenda}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>
      )}
      </div>

      {(futuros || []).length > 0 && (
        <Reveal delay={50}>
          <div className="rounded-2xl p-4 mb-4 mbr-card-lift" style={{ background: `linear-gradient(150deg, ${theme.card} 0%, ${theme.card2} 130%)`, border: `1px solid ${theme.cardBorder}` }}>
            <SectionTitle color={theme.blue}>Contas futuras</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(() => {
                const { previstoEntrada12Meses, previstoSaida12Meses, saldoPrevisto12Meses } = totaisFuturos(futuros, motos);
                return (
                  <>
                    <div>
                      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
                        A receber (12 meses)
                      </div>
                      <div style={{ fontFamily: HEAD_FONT, fontSize: 18, color: theme.mint }}>{fmt(previstoEntrada12Meses)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
                        A pagar (12 meses)
                      </div>
                      <div style={{ fontFamily: HEAD_FONT, fontSize: 18, color: theme.coral }}>{fmt(previstoSaida12Meses)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
                        Saldo previsto
                      </div>
                      <div style={{ fontFamily: HEAD_FONT, fontSize: 18, color: saldoPrevisto12Meses >= 0 ? theme.mint : theme.coral }}>
                        {fmt(saldoPrevisto12Meses)}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
                Próximos 7 dias
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(() => {
                  const { entrada: entrada7d, saida: saida7d, itensEntrada: itensEntrada7d, itensSaida: itensSaida7d } = futurosProximosDias(futuros, motos, 7);
                  return (
                    <>
                      <div>
                        <div className="text-xs mb-1" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
                          A receber
                        </div>
                        <ValorComDetalhe itens={itensEntrada7d} fmt={fmt}>
                          <div style={{ fontFamily: HEAD_FONT, fontSize: 18, color: theme.mint }}>{fmt(entrada7d)}</div>
                        </ValorComDetalhe>
                      </div>
                      <div>
                        <div className="text-xs mb-1" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
                          A pagar
                        </div>
                        <ValorComDetalhe itens={itensSaida7d} fmt={fmt}>
                          <div style={{ fontFamily: HEAD_FONT, fontSize: 18, color: theme.coral }}>{fmt(saida7d)}</div>
                        </ValorComDetalhe>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </Reveal>
      )}

      <Reveal>
      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div className="rounded-2xl p-4 mbr-card-lift" style={{ background: `linear-gradient(150deg, ${theme.card} 0%, ${theme.card2} 130%)`, border: `1px solid ${theme.cardBorder}` }}>
          <SectionTitle color={theme.mint}>Motos que mais faturam/mês</SectionTitle>
          {rankingFaturamento.length === 0 ? (
            <div className="text-xs" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
              Nenhuma moto alugada no momento.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {rankingFaturamento.map((m) => (
                <div key={m.placa}>
                  <div className="flex justify-between text-xs mb-1" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
                    <span>{formatPlaca(m.placa)}</span>
                    <span>{fmt(m.total)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: theme.bg, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(m.total / maxFaturamentoMoto) * 100}%`, background: theme.mint }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl p-4 mbr-card-lift" style={{ background: `linear-gradient(150deg, ${theme.card} 0%, ${theme.card2} 130%)`, border: `1px solid ${theme.cardBorder}` }}>
          <SectionTitle color={theme.amber}>Gastos por natureza (total)</SectionTitle>
          <div className="flex flex-col gap-2">
            {porNatureza.map((n) => (
              <div key={n.natureza}>
                <div className="flex justify-between text-xs mb-1" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
                  <span>{n.natureza}</span>
                  <span>{fmt(n.total)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: theme.bg, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(n.total / maxNatureza) * 100}%`, background: theme.amber }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {rankingManutencao.length > 0 && (
          <div className="rounded-2xl p-4 mbr-card-lift" style={{ background: `linear-gradient(150deg, ${theme.card} 0%, ${theme.card2} 130%)`, border: `1px solid ${theme.cardBorder}` }}>
            <SectionTitle color={theme.coral}>Maiores gastos de manutenção</SectionTitle>
            <div className="flex flex-col gap-2">
              {rankingManutencao.map((m) => (
                <div key={m.placa}>
                  <div className="flex justify-between text-xs mb-1" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
                    <span>{formatPlaca(m.placa)}</span>
                    <span>{fmt(m.total)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: theme.bg, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(m.total / maxManutencao) * 100}%`, background: theme.coral }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </Reveal>
    </div>
  );
}

/* ===========================================================
   CONFIGURAÇÕES — logo própria + cores do site
=========================================================== */
const LINK_RASTREIO_PADRAO = "https://web.melocaliza.com.br/sharing/126b3fd40579524296cf586b7625cd97";

function RastreioView({ config, motos, clientes, topInset, bottomInset }) {
  const link = config?.linkRastreioGeral || LINK_RASTREIO_PADRAO;
  return (
    <TrackingMap
      link={link}
      height="100%"
      rounded={false}
      motos={motos}
      clientes={clientes}
      topInset={topInset}
      bottomInset={bottomInset}
    />
  );
}

const CORES_CONFIGURAVEIS = ["bg", "accent", "brand", "coral", "blue"];

function ConfiguracoesView({ config, persist }) {
  const [local, setLocal] = useState(config);
  const [status, setStatus] = useState({ text: "", kind: "" }); // kind: "ok" | "erro" | ""
  const [historicoCores, setHistoricoCores] = useState([]);
  const [novoPresetNome, setNovoPresetNome] = useState("");
  const logoInputRef = useRef(null);

  // se outra pessoa (ex. seu pai) mudar as configurações, reflete aqui
  useEffect(() => {
    setLocal(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.bg, config.accent, config.brand, config.coral, config.blue, config.logoDataUrl]);

  const salvarAgora = async (next) => {
    setStatus({ text: "Salvando...", kind: "" });
    await persist(next);
    setStatus({ text: "Salvo ✓", kind: "ok" });
    setTimeout(() => setStatus({ text: "", kind: "" }), 1800);
  };

  const handleLogo = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setStatus({ text: "Imagem acima de 5MB — tente uma versão menor.", kind: "erro" });
      return;
    }
    setStatus({ text: "Enviando logo...", kind: "" });
    (async () => {
      const url = await uploadArquivo(`logo-${Date.now()}-${nomeArquivoSeguro(file.name)}`, file);
      if (!url) {
        setStatus({ text: "Não foi possível enviar a logo agora.", kind: "erro" });
        return;
      }
      const next = { ...local, logoDataUrl: url, logoName: file.name };
      setLocal(next);
      await persist(next);
      setStatus({ text: "Logo salva ✓", kind: "ok" });
      setTimeout(() => setStatus({ text: "", kind: "" }), 1800);
    })();
  };

  const removerLogo = () => {
    const next = { ...local, logoDataUrl: "", logoName: "" };
    setLocal(next);
    salvarAgora(next);
  };

  // enquanto arrasta o seletor de cor, só atualiza a prévia local (sem gravar a cada pixel);
  // a gravação de verdade acontece ao soltar (onBlur) ou ao tocar em "Aplicar cores"
  const setCorLocal = (chave) => (e) => setLocal((l) => ({ ...l, [chave]: e.target.value }));

  // guarda a combinação de cores anterior antes de aplicar uma nova — é o que
  // o botão "Voltar" usa pra desfazer a última alteração
  const snapshotCores = (fonte) => {
    const snap = {};
    CORES_CONFIGURAVEIS.forEach((c) => (snap[c] = fonte[c] || ""));
    return snap;
  };
  const guardarHistorico = () => setHistoricoCores((h) => [...h.slice(-9), snapshotCores(config)]);

  const aplicarCores = () => {
    guardarHistorico();
    salvarAgora(local);
  };

  const restaurarCores = () => {
    guardarHistorico();
    const next = { ...local, bg: "", accent: "", brand: "", coral: "", blue: "" };
    setLocal(next);
    salvarAgora(next);
  };

  const desfazerUltimaCor = () => {
    if (historicoCores.length === 0) return;
    const anterior = historicoCores[historicoCores.length - 1];
    setHistoricoCores((h) => h.slice(0, -1));
    const next = { ...local, ...anterior };
    setLocal(next);
    salvarAgora(next);
  };

  const salvarPresetAtual = () => {
    const nome = novoPresetNome.trim() || `Preset ${(local.presetsCores?.length || 0) + 1}`;
    const preset = { id: uid(), nome, ...snapshotCores(local) };
    const next = { ...local, presetsCores: [...(local.presetsCores || []), preset] };
    setLocal(next);
    salvarAgora(next);
    setNovoPresetNome("");
  };

  const aplicarPreset = (preset) => {
    guardarHistorico();
    const next = { ...local, ...snapshotCores(preset) };
    setLocal(next);
    salvarAgora(next);
  };

  const excluirPreset = (id) => {
    const next = { ...local, presetsCores: (local.presetsCores || []).filter((p) => p.id !== id) };
    setLocal(next);
    salvarAgora(next);
  };

  return (
    <div>
      <h2 style={{ fontFamily: HEAD_FONT, fontSize: 22, fontWeight: 800, color: theme.mint }} className="mb-4">
        Configurações
      </h2>

      <div className="rounded-2xl p-4 mb-4" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
        <FieldLabel>Logo da empresa</FieldLabel>
        <div className="flex items-center gap-3 mb-2">
          <div
            className="flex items-center justify-center rounded-xl"
            style={{ width: 64, height: 64, background: theme.bg, border: `1px solid ${theme.cardBorder}` }}
          >
            {local.logoDataUrl ? (
              <img src={local.logoDataUrl} alt="Logo atual" style={{ maxWidth: 56, maxHeight: 56 }} />
            ) : (
              <ImageIcon size={22} color={theme.textMuted} />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogo} style={{ display: "none" }} />
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="text-xs font-semibold rounded-xl px-3 py-1.5"
              style={{ background: theme.mint, color: theme.mintText }}
            >
              Enviar imagem da logo
            </button>
            {local.logoDataUrl && (
              <button type="button" onClick={removerLogo} className="text-xs font-semibold" style={{ color: theme.coral }}>
                Remover e usar a marca padrão
              </button>
            )}
          </div>
        </div>
        <div className="text-xs mb-3" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
          PNG com fundo transparente funciona melhor. Até 5MB.
        </div>

        {local.logoDataUrl && (
          <div className="pt-3" style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
            <div className="flex items-center justify-between mb-1.5">
              <span style={{ color: theme.text, fontFamily: BODY_FONT, fontSize: 13, fontWeight: 600 }}>
                Tamanho da logo no topo
              </span>
              <span style={{ color: theme.textMuted, fontFamily: BODY_FONT, fontSize: 12 }}>
                {local.logoSize || 38}px
              </span>
            </div>
            <input
              type="range"
              min={24}
              max={90}
              step={2}
              value={local.logoSize || 38}
              onChange={(e) => setLocal((l) => ({ ...l, logoSize: Number(e.target.value) }))}
              onMouseUp={() => salvarAgora({ ...local })}
              onTouchEnd={() => salvarAgora({ ...local })}
              style={{ width: "100%", accentColor: theme.mint }}
            />
          </div>
        )}
      </div>

      <div className="rounded-2xl p-4 mb-4" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
        <FieldLabel>Link de rastreio (aba Rastreio)</FieldLabel>
        <input
          style={inputStyle}
          value={local.linkRastreioGeral || ""}
          onChange={(e) => setLocal((l) => ({ ...l, linkRastreioGeral: e.target.value }))}
          onBlur={() => salvarAgora(local)}
          placeholder="https://web.melocaliza.com.br/sharing/..."
        />
        <div className="text-xs -mt-2" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
          Na Melocaliza: Compartilhar localização → Novo → selecione todas as motos → validade "Nenhum" → copie o link.
        </div>
      </div>

      <div className="rounded-2xl p-4 mb-4" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
        <FieldLabel>Cores do site</FieldLabel>
        <div className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${theme.cardBorder}` }}>
          <span style={{ color: theme.text, fontFamily: BODY_FONT, fontSize: 14 }}>Cor de fundo</span>
          <input
            type="color"
            value={local.bg || DEFAULT_THEME.bg}
            onChange={setCorLocal("bg")}
            onBlur={aplicarCores}
            style={{ width: 40, height: 30, background: "none", border: "none" }}
          />
        </div>
        <div className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${theme.cardBorder}` }}>
          <span style={{ color: theme.text, fontFamily: BODY_FONT, fontSize: 14 }}>Cor de destaque (status, botões)</span>
          <input
            type="color"
            value={local.accent || DEFAULT_THEME.amber}
            onChange={setCorLocal("accent")}
            onBlur={aplicarCores}
            style={{ width: 40, height: 30, background: "none", border: "none" }}
          />
        </div>
        <div className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${theme.cardBorder}` }}>
          <span style={{ color: theme.text, fontFamily: BODY_FONT, fontSize: 14 }}>Cor da marca (wordmark, links)</span>
          <input
            type="color"
            value={local.brand || DEFAULT_THEME.mint}
            onChange={setCorLocal("brand")}
            onBlur={aplicarCores}
            style={{ width: 40, height: 30, background: "none", border: "none" }}
          />
        </div>
        <div className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${theme.cardBorder}` }}>
          <span style={{ color: theme.text, fontFamily: BODY_FONT, fontSize: 14 }}>Cor de alerta (vencidos, saídas)</span>
          <input
            type="color"
            value={local.coral || DEFAULT_THEME.coral}
            onChange={setCorLocal("coral")}
            onBlur={aplicarCores}
            style={{ width: 40, height: 30, background: "none", border: "none" }}
          />
        </div>
        <div className="flex items-center justify-between py-2">
          <span style={{ color: theme.text, fontFamily: BODY_FONT, fontSize: 14 }}>Cor informativa (gráficos, contratos)</span>
          <input
            type="color"
            value={local.blue || DEFAULT_THEME.blue}
            onChange={setCorLocal("blue")}
            onBlur={aplicarCores}
            style={{ width: 40, height: 30, background: "none", border: "none" }}
          />
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          <button
            onClick={aplicarCores}
            className="text-xs font-semibold rounded-xl px-3 py-1.5"
            style={{ background: theme.mint, color: theme.mintText }}
          >
            Aplicar cores
          </button>
          <button
            onClick={desfazerUltimaCor}
            disabled={historicoCores.length === 0}
            className="flex items-center gap-1 text-xs font-semibold rounded-xl px-3 py-1.5"
            style={{
              border: `1px solid ${theme.cardBorder}`,
              color: historicoCores.length === 0 ? theme.textMuted : theme.text,
              opacity: historicoCores.length === 0 ? 0.5 : 1,
              cursor: historicoCores.length === 0 ? "default" : "pointer",
            }}
          >
            <Undo2 size={13} /> Voltar
          </button>
          <button
            onClick={restaurarCores}
            className="text-xs font-semibold rounded-xl px-3 py-1.5"
            style={{ border: `1px solid ${theme.cardBorder}`, color: theme.text }}
          >
            Restaurar padrão
          </button>
        </div>

        <div className="pt-3 mt-3" style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
          <span style={{ color: theme.text, fontFamily: BODY_FONT, fontSize: 13, fontWeight: 600 }}>Presets de cor</span>
          <div className="text-xs mb-2" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
            Salve a combinação atual pra trocar de visual rapidamente depois.
          </div>
          {(local.presetsCores || []).length > 0 && (
            <div className="flex flex-col gap-1.5 mb-2">
              {local.presetsCores.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl px-2.5 py-1.5"
                  style={{ background: theme.card2, border: `1px solid ${theme.cardBorder}` }}
                >
                  <button
                    onClick={() => aplicarPreset(p)}
                    className="flex items-center gap-2 flex-1 text-left"
                    style={{ color: theme.text, fontFamily: BODY_FONT, fontSize: 13 }}
                  >
                    <span className="flex" style={{ gap: 2 }}>
                      {CORES_CONFIGURAVEIS.map((c) => (
                        <span
                          key={c}
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            background: p[c] || DEFAULT_THEME[c === "accent" ? "amber" : c === "brand" ? "mint" : c] || "#888",
                            border: `1px solid ${theme.cardBorder}`,
                          }}
                        />
                      ))}
                    </span>
                    {p.nome}
                  </button>
                  <button onClick={() => excluirPreset(p.id)} className="mbr-hover-grow" style={{ color: theme.textMuted }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={novoPresetNome}
              onChange={(e) => setNovoPresetNome(e.target.value)}
              placeholder="Nome do preset (opcional)"
            />
            <button
              onClick={salvarPresetAtual}
              className="text-xs font-semibold rounded-xl px-3 py-1.5 flex-shrink-0"
              style={{ border: `1px solid ${theme.cardBorder}`, color: theme.text }}
            >
              Salvar preset atual
            </button>
          </div>
        </div>
      </div>

      {status.text && (
        <div
          className="text-xs font-semibold rounded-xl px-3 py-2 inline-block"
          style={{
            color: status.kind === "erro" ? theme.coral : theme.mint,
            background: status.kind === "erro" ? `${theme.coral}1F` : `${theme.mint}1F`,
            fontFamily: BODY_FONT,
          }}
        >
          {status.text}
        </div>
      )}
    </div>
  );
}

/* ===========================================================
   DADOS DA PLANILHA — extraídos de Mobirelli_280726.xlsx em 30/07/2026.
   Manutenções já ficam dentro de cada moto (não duplicadas no fluxo de
   caixa, que na planilha original registrava as mesmas manutenções de novo).
=========================================================== */
const SEED_CLIENTES = [
  { id: "cli-avant", nome: "AVANT", cpfCnpj: "34.174.750/0001-76", telefone: "(11) 97476-3443", email: "", cep: "12955-000", logradouro: "", numero: "", bairro: "", cidade: "", estado: "", observacoes: "" },
  { id: "cli-maicon", nome: "MAICON H. DOS REIS", cpfCnpj: "230.216.468-75", telefone: "(19) 99856-4356", email: "", cep: "13503-665", logradouro: "", numero: "", bairro: "", cidade: "", estado: "", observacoes: "" },
  { id: "cli-celio", nome: "CELIO ROBERTO ALVES", cpfCnpj: "297.288.148-60", telefone: "(19) 98202-8449", email: "", cep: "13506-663", logradouro: "", numero: "", bairro: "", cidade: "", estado: "", observacoes: "" },
  { id: "cli-luciano", nome: "LUCIANO P. DE BARROS", cpfCnpj: "250.556.978-90", telefone: "(11) 97495-9121", email: "", cep: "13257-210", logradouro: "", numero: "", bairro: "", cidade: "", estado: "", observacoes: "" },
  { id: "cli-thiago", nome: "THIAGO A. DE OLIVEIRA P.", cpfCnpj: "357.086.398-06", telefone: "(19) 99291-2925", email: "", cep: "13253-291", logradouro: "", numero: "", bairro: "", cidade: "", estado: "", observacoes: "" },
  { id: "cli-andre", nome: "ANDRE LUIZ BRITO DA S.", cpfCnpj: "367.349.848-77", telefone: "(11) 97861-7040", email: "", cep: "13255-064", logradouro: "", numero: "", bairro: "", cidade: "", estado: "", observacoes: "" },
];

const SEED_MOTOS = [
  {
    id: "moto-urb5i50", modelo: "JTZ/NK150", placa: "URB5I50", chassi: "99KJCK4PKVM128207", renavam: "1492671867",
    dataCompra: "2026-05-08", nfNumero: "000009496", valorCompra: 17372.64, notaFiscalAnexos: [], status: "alugada",
    contratoAtual: { id: "ctr-urb-1", clienteId: "cli-avant", numeroContrato: 1, numeroClienteMoto: 1, dataInicio: "", dataVencimento: "", valorMensal: 1590, formaPagamento: "Boleto Bancário", anexos: [] },
    historicoContratos: [],
    manutencoes: [
      { id: "mnt-urb-1", data: "2026-06-05", tipo: "Troca de Óleo", valorGasto: 55, local: "Turella Com. Motopeças", garantia: false },
      { id: "mnt-urb-2", data: "2026-06-05", tipo: "Diversos", valorGasto: 25, local: "Turella Com. Motopeças", garantia: false },
      { id: "mnt-urb-3", data: "2026-06-05", tipo: "Suporte Placa", valorGasto: 15, local: "Turella Com. Motopeças", garantia: false },
      { id: "mnt-urb-4", data: "2026-06-30", tipo: "Troca de Óleo", valorGasto: 55, local: "Turella Com. Motopeças", garantia: false },
      { id: "mnt-urb-5", data: "2026-07-24", tipo: "Troca de Óleo", valorGasto: 55, local: "Turella Com. Motopeças", garantia: false },
    ],
  },
  {
    id: "moto-uoi5d36", modelo: "JTZ/DK160 S", placa: "UOI5D36", chassi: "99KPCKBCJVM218308", renavam: "1498255997",
    dataCompra: "2026-06-11", nfNumero: "000009841", valorCompra: 15880.31, notaFiscalAnexos: [], status: "alugada",
    contratoAtual: { id: "ctr-uoi-2", clienteId: "cli-andre", numeroContrato: 2, numeroClienteMoto: 2, dataInicio: "", dataVencimento: "", valorMensal: 1428, formaPagamento: "Boleto Bancário", anexos: [] },
    historicoContratos: [
      { id: "ctr-uoi-1", clienteId: "cli-maicon", numeroContrato: 1, numeroClienteMoto: 1, dataInicio: "", dataVencimento: "", valorMensal: 1600, formaPagamento: "Boleto Bancário", anexos: [], encerradoEm: "" },
    ],
    manutencoes: [{ id: "mnt-uoi-1", data: "2026-07-01", tipo: "Troca de Óleo", valorGasto: 60, local: "F. M. Basses Motopeças", garantia: false }],
  },
  {
    id: "moto-uou1d13", modelo: "JTZ/DK160 S", placa: "UOU1D13", chassi: "99KPCKBCJVM220650", renavam: "1501043355",
    dataCompra: "2026-06-27", nfNumero: "000009981", valorCompra: 15810.31, notaFiscalAnexos: [], status: "alugada",
    contratoAtual: { id: "ctr-uou-1", clienteId: "cli-celio", numeroContrato: 1, numeroClienteMoto: 1, dataInicio: "", dataVencimento: "", valorMensal: 1600, formaPagamento: "Boleto Bancário", anexos: [] },
    historicoContratos: [],
    manutencoes: [],
  },
  {
    id: "moto-uon6i43", modelo: "JTZ/DK160 S", placa: "UON6I43", chassi: "99KPCKBCJVM220655", renavam: "1501070379",
    dataCompra: "2026-06-27", nfNumero: "000009982", valorCompra: 15810.31, notaFiscalAnexos: [], status: "alugada",
    contratoAtual: { id: "ctr-uon-1", clienteId: "cli-luciano", numeroContrato: 1, numeroClienteMoto: 1, dataInicio: "", dataVencimento: "", valorMensal: 1440, formaPagamento: "Boleto Bancário", anexos: [] },
    historicoContratos: [],
    manutencoes: [{ id: "mnt-uon-1", data: "2026-07-08", tipo: "Pneu", valorGasto: 160, local: "Turella Com. Motopeças", garantia: false }],
  },
  {
    id: "moto-uoo1a56", modelo: "JTZ/DK160 S", placa: "UOO1A56", chassi: "99KPCKBCJVM220675", renavam: "1503860997",
    dataCompra: "2026-07-16", nfNumero: "000010159", valorCompra: 15810.31, notaFiscalAnexos: [], status: "alugada",
    contratoAtual: { id: "ctr-uoo-1", clienteId: "cli-thiago", numeroContrato: 1, numeroClienteMoto: 1, dataInicio: "", dataVencimento: "", valorMensal: 1400, formaPagamento: "Boleto Bancário", anexos: [] },
    historicoContratos: [],
    manutencoes: [],
  },
  {
    id: "moto-upm5c78", modelo: "JTZ/DK160 S", placa: "UPM5C78", chassi: "99KPCKBCJVM220331", renavam: "1503855217",
    dataCompra: "2026-07-16", nfNumero: "000010158", valorCompra: 15810.31, notaFiscalAnexos: [], status: "preparacao",
    contratoAtual: null,
    historicoContratos: [],
    manutencoes: [],
  },
];

const SEED_FLUXO = [
  { id: "flx-1", tipo: "saida", natureza: "Administrativo", data: "2026-05-03", categoria: "LR Moraes", forma: "", valor: 450, descricao: "" },
  { id: "flx-2", tipo: "saida", natureza: "Expansão", data: "2026-05-06", categoria: "Consultoria Rogerio", forma: "Pix Fê", valor: 45000, descricao: "" },
  { id: "flx-3", tipo: "saida", natureza: "Expansão", data: "2026-05-06", categoria: "Abertura Empresa (LR Moraes)", forma: "Pix Itau FÊ", valor: 1700, descricao: "" },
  { id: "flx-4", tipo: "saida", natureza: "Expansão", data: "2026-05-12", categoria: "Consultoria Rogerio", forma: "Pix Fê", valor: 25000, descricao: "" },
  { id: "flx-5", tipo: "saida", natureza: "Expansão", data: "2026-05-15", categoria: "Corpo de Bombeiros", forma: "", valor: 600, descricao: "" },
  { id: "flx-6", tipo: "saida", natureza: "Expansão", data: "2026-05-22", categoria: "Certificado Digital", forma: "", valor: 230, descricao: "" },
  { id: "flx-7", tipo: "saida", natureza: "Operacional", data: "2026-06-01", categoria: "Seguro", forma: "", valor: 119.9, descricao: "" },
  { id: "flx-8", tipo: "saida", natureza: "Administrativo", data: "2026-06-03", categoria: "LR Moraes", forma: "Pix NuBank Mobirelli", valor: 450, descricao: "" },
  { id: "flx-9", tipo: "saida", natureza: "Expansão", data: "2026-06-12", categoria: "Grizzotti Despachante", forma: "Pix NuBank Mobirelli", valor: 930, descricao: "" },
  { id: "flx-10", tipo: "entrada", natureza: "Operacional", data: "2026-06-23", categoria: "Mensalidade URB5I50", forma: "Boleto Bancário", valor: 1590, descricao: "" },
  { id: "flx-11", tipo: "saida", natureza: "Operacional", data: "2026-06-23", categoria: "TAXA Rogério", forma: "Pix NuBank Mobirelli", valor: 200, descricao: "" },
  { id: "flx-12", tipo: "saida", natureza: "Operacional", data: "2026-06-25", categoria: "Logística (UBER)", forma: "Cartão Mobirelli", valor: 58.97, descricao: "" },
  { id: "flx-13", tipo: "saida", natureza: "Operacional", data: "2026-06-25", categoria: "Logística (UBER)", forma: "Cartão Mobirelli", valor: 59.98, descricao: "" },
  { id: "flx-14", tipo: "saida", natureza: "Expansão", data: "2026-06-27", categoria: "2 motos Suzuki", forma: "Cartão GUI", valor: 2706.22, descricao: "" },
  { id: "flx-15", tipo: "saida", natureza: "Expansão", data: "2026-06-27", categoria: "Comissão Rogério", forma: "Pix NuBank Mobirelli", valor: 6400, descricao: "" },
  { id: "flx-16", tipo: "saida", natureza: "Expansão", data: "2026-06-30", categoria: "Grizzotti Despachante", forma: "Pix NuBank Mobirelli", valor: 950, descricao: "" },
  { id: "flx-17", tipo: "saida", natureza: "Expansão", data: "2026-06-30", categoria: "Grizzotti Despachante", forma: "Pix NuBank Mobirelli", valor: 950, descricao: "" },
  { id: "flx-18", tipo: "saida", natureza: "Administrativo", data: "2026-07-02", categoria: "LR Moraes", forma: "Pix NuBank Mobirelli", valor: 450, descricao: "" },
  { id: "flx-19", tipo: "saida", natureza: "Expansão", data: "2026-07-16", categoria: "2 motos Suzuki", forma: "Pix NuBank Mobirelli", valor: 31620.74, descricao: "" },
  { id: "flx-20", tipo: "saida", natureza: "Expansão", data: "2026-07-20", categoria: "Grizzotti Despachante", forma: "Pix NuBank Mobirelli", valor: 1820, descricao: "" },
  { id: "flx-21", tipo: "saida", natureza: "Expansão", data: "2026-07-21", categoria: "Comissão Rogério", forma: "Pix NuBank Mobirelli", valor: 6400, descricao: "" },
  { id: "flx-22", tipo: "entrada", natureza: "Operacional", data: "2026-07-21", categoria: "Mensalidade URB5I50", forma: "Boleto Bancário", valor: 1588.29, descricao: "" },
  { id: "flx-23", tipo: "entrada", natureza: "Operacional", data: "2026-07-23", categoria: "Mensalidade UOI5D36", forma: "Boleto Bancário", valor: 1598.02, descricao: "" },
  { id: "flx-24", tipo: "saida", natureza: "Administrativo", data: "2026-07-25", categoria: "Fatura nubank Mobirelli", forma: "Pix NuBank Mobirelli", valor: 378.77, descricao: "" },
  { id: "flx-25", tipo: "saida", natureza: "Operacional", data: "2026-07-26", categoria: "Seguro Melocaliza", forma: "Pix NuBank Mobirelli", valor: 689.4, descricao: "" },
];

/* ===========================================================
   APP PRINCIPAL
=========================================================== */
export default function MobirelliApp() {
  const [tab, setTab] = useState("dashboard");
  const headerRef = useRef(null);
  const navRef = useRef(null);
  const tabSlotRefs = useRef({});
  const [pilulaRect, setPilulaRect] = useState(null);
  // altura real da barra de cima/baixo — usado no Rastreio pra empurrar os controles
  // do mapa pra fora da faixa que fica por baixo delas (que agora é semitransparente)
  const [chromeHeights, setChromeHeights] = useState({ header: 64, nav: 76 });

  useEffect(() => {
    const medir = () => {
      setChromeHeights({
        header: headerRef.current?.offsetHeight || 64,
        nav: navRef.current?.offsetHeight || 76,
      });
    };
    medir();
    const ro = new ResizeObserver(medir);
    if (headerRef.current) ro.observe(headerRef.current);
    if (navRef.current) ro.observe(navRef.current);
    window.addEventListener("resize", medir);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, []);

  const motosState = useSharedList("mobirelli-motos");
  const clientesState = useSharedList("mobirelli-clientes");
  const fluxoState = useSharedList("mobirelli-fluxo-caixa");
  const futurosState = useSharedList("mobirelli-fluxo-futuro");
  const configState = useSharedObject("mobirelli-config", {});

  // recalcula o tema ativo (mutando o objeto compartilhado) a partir das configurações salvas —
  // como nenhum componente aqui usa memo, todo mundo lê os valores atualizados no próximo render
  Object.assign(theme, buildTheme(configState.value));

  // cobre a área que aparece durante o "elástico" do scroll (Mac) — sem isso, dava pra
  // ver o fundo padrão (branco) do navegador atrás do site ao arrastar além do topo/fim
  useEffect(() => {
    document.documentElement.style.backgroundColor = theme.bg;
    document.body.style.backgroundColor = theme.bg;
  }, [theme.bg]);

  const loading = motosState.loading || clientesState.loading || fluxoState.loading || configState.loading;
  const anyError = motosState.error || clientesState.error || fluxoState.error || configState.error;

  // carrega os dados da planilha sozinho, uma vez, sem precisar de nenhum botão —
  // cada lista só é preenchida se ainda estiver vazia (não sobrescreve o que já foi editado)
  useEffect(() => {
    if (!motosState.loading && motosState.items.length === 0) motosState.persist(SEED_MOTOS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motosState.loading]);
  useEffect(() => {
    if (!clientesState.loading && clientesState.items.length === 0) clientesState.persist(SEED_CLIENTES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesState.loading]);
  useEffect(() => {
    if (!fluxoState.loading && fluxoState.items.length === 0) fluxoState.persist(SEED_FLUXO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fluxoState.loading]);

  const tabs = [
    { id: "dashboard", label: "Início", icon: LayoutDashboard },
    { id: "motos", label: "Motos", icon: Bike },
    { id: "clientes", label: "Clientes", icon: Users },
    { id: "fluxo", label: "Caixa", icon: Wallet },
    { id: "rastreio", label: "Rastreio", icon: Navigation },
    { id: "config", label: "Ajustes", icon: Settings },
  ];

  // mede a posição do ícone da aba ativa pra "pílula" verde deslizar até ali (em vez de
  // simplesmente aparecer/desaparecer em cada aba) — precisa medir de novo sempre que a
  // aba muda ou a tela redimensiona, já que os botões são distribuídos com flex
  useEffect(() => {
    const medir = () => {
      const slot = tabSlotRefs.current[tab];
      const navEl = navRef.current;
      if (!slot || !navEl) return;
      const slotRect = slot.getBoundingClientRect();
      const navRect = navEl.getBoundingClientRect();
      setPilulaRect({ left: slotRect.left - navRect.left, top: slotRect.top - navRect.top, width: slotRect.width, height: slotRect.height });
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [tab]);

  // arrastar a pílula pro lado troca de aba também, igual num seletor de segmentos do
  // iOS — guarda o centro de cada aba (medido só uma vez, no início do arrasto) pra achar
  // qual fica mais perto do dedo quando soltar
  const dragInfoRef = useRef(null);
  const dragLeftRef = useRef(null);
  const [arrastando, setArrastando] = useState(false);
  const [dragLeft, setDragLeft] = useState(null);

  const iniciarArrasto = (e) => {
    const navEl = navRef.current;
    if (!navEl || !pilulaRect) return;
    const navRect = navEl.getBoundingClientRect();
    const centros = tabs.map((t) => {
      const el = tabSlotRefs.current[t.id];
      const r = el.getBoundingClientRect();
      return { id: t.id, center: r.left - navRect.left + r.width / 2 };
    });
    dragInfoRef.current = { startClientX: e.clientX, startLeft: pilulaRect.left, centros, maxLeft: navRect.width - pilulaRect.width };
    dragLeftRef.current = pilulaRect.left;
    setArrastando(true);
    setDragLeft(pilulaRect.left);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moverArrasto = (e) => {
    const info = dragInfoRef.current;
    if (!info) return;
    const delta = e.clientX - info.startClientX;
    const novo = Math.max(0, Math.min(info.maxLeft, info.startLeft + delta));
    dragLeftRef.current = novo;
    setDragLeft(novo);
  };

  const soltarArrasto = () => {
    const info = dragInfoRef.current;
    if (!info) return;
    const centroAtual = (dragLeftRef.current ?? info.startLeft) + pilulaRect.width / 2;
    let maisProximo = info.centros[0];
    let menorDist = Infinity;
    info.centros.forEach((c) => {
      const d = Math.abs(c.center - centroAtual);
      if (d < menorDist) {
        menorDist = d;
        maisProximo = c;
      }
    });
    dragInfoRef.current = null;
    dragLeftRef.current = null;
    setDragLeft(null);
    setArrastando(false);
    if (maisProximo.id !== tab) setTab(maisProximo.id);
  };

  return (
    <div
      style={{
        backgroundColor: theme.bg,
        backgroundImage: `radial-gradient(circle at 12% -8%, ${theme.mint}12 0%, transparent 38%), radial-gradient(circle at 105% 8%, ${theme.blue}0F 0%, transparent 34%), radial-gradient(circle at 50% 115%, ${theme.amber}0A 0%, transparent 36%)`,
        backgroundAttachment: "fixed",
        minHeight: "100vh",
        fontFamily: BODY_FONT,
      }}
    >
      <style>{`
        ${fontImport}
        * { -webkit-tap-highlight-color: transparent; }
        button { transition: opacity 0.15s ease, transform 0.16s ease, filter 0.15s ease; cursor: pointer; }
        button:active { transform: scale(0.97); opacity: 0.85; }
        .mbr-hover-grow { transform-origin: center; }
        .mbr-tab-icon { transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .mbr-card-lift { transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.28s ease; will-change: transform; }
        @media (hover: hover) and (pointer: fine) {
          button:hover { filter: brightness(1.22); }
          nav button:hover { filter: none; transform: translateY(-2px); }
          nav button:hover span:first-child { background: ${hexToRgba(theme.mint, 0.1)}; }
          nav button:hover .mbr-tab-icon { transform: scale(1.2) rotate(-6deg); }
          .mbr-hover-grow:hover { transform: scale(1.16); filter: brightness(1.28); }
          .mbr-card-lift:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,0,0,0.24); }
        }
        input, select, textarea, button { font-family: ${BODY_FONT}; }
        input:focus, select:focus, textarea:focus, button:focus-visible {
          outline: 2px solid ${theme.mint}; outline-offset: 1px;
        }
        @media (prefers-reduced-motion: reduce) {
          * { transition: none !important; animation: none !important; }
        }
        @keyframes mbrPulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.9; } }
        .mbr-skel { animation: mbrPulse 1.3s ease-in-out infinite; border-radius: 10px; background: ${theme.card}; }
        @keyframes mbrFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .mbr-fade-in { animation: mbrFadeIn 0.24s ease both; }
      `}</style>

      <header
        ref={headerRef}
        className="px-4 sm:px-8 py-3 grid items-center sticky top-0 z-40"
        style={{
          gridTemplateColumns: "1fr auto 1fr",
          paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))",
          background:
            tab === "rastreio"
              ? `linear-gradient(to bottom, ${hexToRgba(theme.panel, 0.9)} 0%, ${hexToRgba(theme.panel, 0.9)} 50%, ${hexToRgba(theme.panel, 0)} 100%)`
              : hexToRgba(theme.panel, 0.82),
          borderBottom: tab === "rastreio" ? "none" : `1px solid ${theme.cardBorder}`,
          backdropFilter: tab === "rastreio" ? "none" : "saturate(1.6) blur(16px)",
          WebkitBackdropFilter: tab === "rastreio" ? "none" : "saturate(1.6) blur(16px)",
        }}
      >
        {tab === "rastreio" && <BorraProgressiva lado="topo" />}
        <div />
        <div className="flex justify-center">
          <Wordmark logoDataUrl={configState.value.logoDataUrl} logoSize={configState.value.logoSize} />
        </div>
        <div className="flex justify-end">
          {anyError && (
            <span className="text-xs" style={{ color: theme.coral, fontFamily: BODY_FONT }}>
              {anyError}
            </span>
          )}
        </div>
      </header>

      <main
        className={tab === "rastreio" ? "" : "px-4 sm:px-8 pt-5 max-w-5xl mx-auto lg:max-w-7xl"}
        style={
          tab === "rastreio"
            ? { position: "fixed", inset: 0, overflow: "hidden", zIndex: 0 }
            : { paddingBottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }
        }
      >
        {loading ? (
          <div className="flex flex-col gap-3">
            <div className="mbr-skel" style={{ height: 90 }} />
            <div className="grid grid-cols-2 gap-3">
              <div className="mbr-skel" style={{ height: 70 }} />
              <div className="mbr-skel" style={{ height: 70 }} />
            </div>
            <div className="mbr-skel" style={{ height: 220 }} />
          </div>
        ) : (
          <div key={tab} className="mbr-fade-in" style={tab === "rastreio" ? { height: "100%" } : undefined}>
            {tab === "dashboard" ? (
              <DashboardView motos={motosState.items} lancamentos={fluxoState.items} clientes={clientesState.items} futuros={futurosState.items} />
            ) : tab === "motos" ? (
              <MotosView
                motos={motosState.items}
                persist={motosState.persist}
                clientes={clientesState.items}
                persistClientes={clientesState.persist}
                config={configState.value}
                lancamentos={fluxoState.items}
              />
            ) : tab === "clientes" ? (
              <ClientesView
                clientes={clientesState.items}
                persistClientes={clientesState.persist}
                motos={motosState.items}
                persistMotos={motosState.persist}
              />
            ) : tab === "fluxo" ? (
              <FluxoCaixaView
                lancamentos={fluxoState.items}
                persist={fluxoState.persist}
                motos={motosState.items}
                clientes={clientesState.items}
                futuros={futurosState.items}
                persistFuturos={futurosState.persist}
              />
            ) : tab === "rastreio" ? (
              <RastreioView
                config={configState.value}
                motos={motosState.items}
                clientes={clientesState.items}
                topInset={chromeHeights.header}
                bottomInset={chromeHeights.nav}
              />
            ) : (
              <ConfiguracoesView config={configState.value} persist={configState.persist} />
            )}
          </div>
        )}
      </main>

      <nav
        ref={navRef}
        className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-around px-2 py-1.5"
        style={{
          background:
            tab === "rastreio"
              ? `linear-gradient(to bottom, ${hexToRgba(theme.panel, 0)} 0%, ${hexToRgba(theme.panel, 0.9)} 50%, ${hexToRgba(theme.panel, 0.9)} 100%)`
              : hexToRgba(theme.panel, 0.82),
          borderTop: tab === "rastreio" ? "none" : `1px solid ${theme.cardBorder}`,
          paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))",
          backdropFilter: tab === "rastreio" ? "none" : "saturate(1.6) blur(16px)",
          WebkitBackdropFilter: tab === "rastreio" ? "none" : "saturate(1.6) blur(16px)",
        }}
      >
        {tab === "rastreio" && <BorraProgressiva lado="base" />}
        {pilulaRect && (
          <span
            onPointerDown={iniciarArrasto}
            onPointerMove={moverArrasto}
            onPointerUp={soltarArrasto}
            onPointerCancel={soltarArrasto}
            className="absolute rounded-full"
            style={{
              left: 0,
              top: pilulaRect.top,
              width: pilulaRect.width,
              height: pilulaRect.height,
              background: hexToRgba(theme.mint, 0.16),
              zIndex: -1,
              cursor: "grab",
              touchAction: "none",
              willChange: "transform",
              // transform em vez de "left" — anima só na composição da GPU, sem
              // recalcular layout a cada quadro, então fica fluido em qualquer taxa de
              // atualização da tela (inclusive 120Hz), em vez de travar feito antes
              transform: `translateX(${(arrastando ? dragLeft : pilulaRect.left) ?? 0}px)`,
              transition: arrastando ? "none" : "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          />
        )}
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 flex flex-col items-center gap-1 py-1.5"
              style={{
                color: active ? theme.mint : theme.textMuted,
                background: "none",
                transition: "color 0.15s ease, transform 0.18s ease",
                // na aba ativa, o botão "cede o lugar" pra pílula (que fica embaixo dele
                // nessa mesma área) poder receber o toque/arrasto — clicar nela de
                // qualquer jeito não faria nada, já que é a aba em que já se está
                pointerEvents: active ? "none" : "auto",
              }}
            >
              <span
                ref={(el) => (tabSlotRefs.current[t.id] = el)}
                className="relative rounded-full flex items-center justify-center"
                style={{ width: 40, height: 26, zIndex: 1 }}
              >
                <Icon size={19} strokeWidth={active ? 2.4 : 2} className="mbr-tab-icon" />
              </span>
              <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500, fontFamily: BODY_FONT, transition: "font-weight 0.15s ease", pointerEvents: "auto" }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
