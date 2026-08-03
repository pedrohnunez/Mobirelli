import React, { useState, useEffect, useCallback, useRef } from "react";
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
  Phone,
  Mail,
  MapPin,
  Settings,
  Image as ImageIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
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
  bg: "#173A21",
  mint: "#E3F7D8",
  amber: "#E8B93D",
  coral: "#E8735C",
  blue: "#7DB8E8",
};

// objeto mutável — lido "ao vivo" por todos os componentes a cada renderização,
// então recalculá-lo em buildTheme()/Object.assign no topo do App já repinta tudo
const theme = {
  ...DEFAULT_THEME,
  panel: "#1E4A2A",
  card: "#20512E",
  card2: "#265C36",
  cardBorder: "#357248",
  mintText: "#173A21",
  sage: "#8FBF93",
  text: "#F3FBEE",
  textMuted: "#9FC7A6",
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
const mixColors = (hexA, hexB, t) => {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
};
const luminance = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
const contrastText = (hex) => (luminance(hex) > 0.6 ? "#173A21" : "#F3FBEE");

function buildTheme(config) {
  const bg = (config && config.bg) || DEFAULT_THEME.bg;
  const accent = (config && config.accent) || DEFAULT_THEME.amber;
  const brand = (config && config.brand) || DEFAULT_THEME.mint;
  const text = contrastText(bg);
  return {
    bg,
    panel: mixColors(bg, text, 0.07),
    card: mixColors(bg, text, 0.11),
    card2: mixColors(bg, text, 0.17),
    cardBorder: mixColors(bg, text, 0.26),
    text,
    textMuted: mixColors(bg, text, 0.55),
    mint: brand,
    mintText: contrastText(brand),
    sage: mixColors(brand, bg, 0.45),
    amber: accent,
    coral: DEFAULT_THEME.coral,
    blue: DEFAULT_THEME.blue,
  };
}

const HEAD_FONT = "'Poppins', 'Trebuchet MS', sans-serif";
const BODY_FONT = "'Inter', system-ui, sans-serif";

const fontImport = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
`;

/* ===========================================================
   HELPERS
=========================================================== */
const uid = () => Math.random().toString(36).slice(2, 10);

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

const isOverdue = (dateStr) => {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + "T00:00:00") < today;
};

const monthLabel = (key) => {
  const [y, m] = key.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[Number(m) - 1]}/${y.slice(2)}`;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const enderecoCompleto = (c) =>
  [c.logradouro && c.numero ? `${c.logradouro}, ${c.numero}` : c.logradouro, c.bairro, c.cidade && c.estado ? `${c.cidade}/${c.estado}` : c.cidade]
    .filter(Boolean)
    .join(" — ") || "Endereço não informado";

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
function Wordmark({ compact, logoDataUrl }) {
  const [erro, setErro] = useState(false);
  const src = logoDataUrl || "/logo-header.png";
  if (!erro) {
    return <img src={src} alt="Mobirelli" style={{ height: compact ? 28 : 38, display: "block" }} onError={() => setErro(true)} />;
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

function MotoPlate({ placa }) {
  return (
    <div
      style={{
        background: theme.bg,
        border: `2px solid ${theme.amber}`,
        borderRadius: 6,
        padding: "3px 9px",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <div style={{ width: 6, height: 14, background: theme.blue, borderRadius: 2 }} />
      <span style={{ fontFamily: "monospace", fontWeight: 700, letterSpacing: 1.5, fontSize: 14, color: theme.text }}>
        {placa || "SEM PLACA"}
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

function StatCard({ label, value, icon: Icon, accent }) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
          {label}
        </span>
        <Icon size={16} color={accent || theme.textMuted} />
      </div>
      <span style={{ fontFamily: HEAD_FONT, fontSize: 26, fontWeight: 700, color: theme.text }}>{value}</span>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(10,20,13,0.7)" }} onClick={onClose}>
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto"
        style={{ background: theme.panel, border: `1px solid ${theme.cardBorder}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: HEAD_FONT, fontSize: 20, color: theme.text }}>{title}</h3>
          <button onClick={onClose} style={{ color: theme.textMuted }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
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
  borderRadius: 8,
  padding: "8px 10px",
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
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

/* ===========================================================
   ANEXO — link OU upload direto (até 3MB), guardado em chave própria
=========================================================== */
function AnexoField({ label, linkValue, onLinkChange, storageKey, fileName, onFileNameChange }) {
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
      const path = `${storageKey}-${file.name}`;
      const url = await uploadArquivo(path, file);
      if (url) {
        onLinkChange(url);
        onFileNameChange(file.name);
        setStatus("");
      } else {
        setStatus("Não foi possível enviar o arquivo agora.");
      }
    })();
  };

  const handleRemove = () => {
    onLinkChange("");
    onFileNameChange("");
    setStatus("");
  };

  return (
    <div className="mb-3">
      <FieldLabel>{label}</FieldLabel>
      <input style={inputStyle} value={linkValue} onChange={(e) => onLinkChange(e.target.value)} placeholder="Cole o link (Drive, etc.)" />
      <div className="flex items-center gap-2 flex-wrap -mt-1">
        <input ref={inputRef} type="file" accept="application/pdf,image/*" onChange={handleFile} style={{ display: "none" }} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-xs font-semibold rounded-lg px-3 py-1.5"
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
              className="text-xs font-semibold rounded-lg px-3 py-1.5 flex items-center gap-1"
              style={{ background: theme.mint, color: theme.mintText }}
            >
              <FileText size={12} /> {fileName}
            </a>
            <button type="button" onClick={handleRemove} style={{ color: theme.coral }}>
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

/* ===========================================================
   CLIENTES
=========================================================== */
function emptyCliente() {
  return { id: uid(), nome: "", cpfCnpj: "", telefone: "", email: "", cep: "", logradouro: "", numero: "", bairro: "", cidade: "", estado: "", observacoes: "" };
}

function ClienteFormModal({ cliente, onClose, onSave, title }) {
  const [form, setForm] = useState(cliente);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal title={title} onClose={onClose}>
      <FieldLabel>Nome completo</FieldLabel>
      <input style={inputStyle} value={form.nome} onChange={set("nome")} />
      <FieldLabel>CPF ou CNPJ</FieldLabel>
      <input style={inputStyle} value={form.cpfCnpj} onChange={set("cpfCnpj")} />
      <Row2>
        <div>
          <FieldLabel>Telefone</FieldLabel>
          <input style={inputStyle} value={form.telefone} onChange={set("telefone")} />
        </div>
        <div>
          <FieldLabel>E-mail</FieldLabel>
          <input style={inputStyle} value={form.email} onChange={set("email")} />
        </div>
      </Row2>
      <FieldLabel>CEP</FieldLabel>
      <input style={inputStyle} value={form.cep} onChange={set("cep")} />
      <Row2>
        <div>
          <FieldLabel>Logradouro</FieldLabel>
          <input style={inputStyle} value={form.logradouro} onChange={set("logradouro")} placeholder="Rua / Av." />
        </div>
        <div>
          <FieldLabel>Número</FieldLabel>
          <input style={inputStyle} value={form.numero} onChange={set("numero")} />
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
          <input style={inputStyle} value={form.estado} onChange={set("estado")} placeholder="SP" />
        </div>
      </Row2>
      <button onClick={() => onSave(form)} className="w-full rounded-lg py-2 font-semibold mt-1" style={{ background: theme.mint, color: theme.mintText }}>
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
    dataVencimento: "",
    contratoLink: "",
    contratoArquivo: "",
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
        options={motosDisponiveis.map((m) => ({ value: m.id, label: `${m.placa || "sem placa"} — ${m.modelo || "modelo?"}` }))}
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
          <FieldLabel>Vencimento</FieldLabel>
          <input type="date" style={inputStyle} value={contrato.dataVencimento} onChange={setC("dataVencimento")} />
        </div>
      </Row2>
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
      <AnexoField
        label="Contrato assinado"
        linkValue={contrato.contratoLink}
        onLinkChange={(v) => setContrato({ ...contrato, contratoLink: v })}
        storageKey={`mobirelli-arquivo-contrato-${contratoId}`}
        fileName={contrato.contratoArquivo}
        onFileNameChange={(name) => setContrato({ ...contrato, contratoArquivo: name })}
      />
      <button
        onClick={() =>
          onSave({ motoId, contrato: { ...contrato, id: contratoId, valorMensal: Number(contrato.valorMensal) || 0 } })
        }
        className="w-full rounded-lg py-2 font-semibold mt-1"
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

  const filtrados = clientes.filter((c) => {
    const q = busca.toLowerCase();
    return !q || c.nome?.toLowerCase().includes(q) || c.cpfCnpj?.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 style={{ fontFamily: HEAD_FONT, fontSize: 22, color: theme.text }}>Clientes</h2>
        <button
          onClick={() => setModal({ mode: "novo", cliente: emptyCliente() })}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold"
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
        <div className="rounded-xl p-6 text-center" style={{ background: theme.card, color: theme.textMuted, fontFamily: BODY_FONT }}>
          Nenhum cliente encontrado.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtrados.map((c) => {
          const motoVinculada = motos.find((m) => m.contratoAtual?.clienteId === c.id);
          const aberto = expandido === c.id;
          return (
            <div key={c.id} className="rounded-xl overflow-hidden" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
              <button className="w-full flex items-center justify-between px-4 py-3 text-left" onClick={() => setExpandido(aberto ? null : c.id)}>
                <div>
                  <div style={{ fontFamily: HEAD_FONT, fontSize: 17, color: theme.text }}>{c.nome || "Sem nome"}</div>
                  <div className="text-xs" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
                    {motoVinculada ? `Com a moto ${motoVinculada.placa}` : "Sem moto no momento"}
                  </div>
                </div>
                {aberto ? <ChevronUp size={18} color={theme.textMuted} /> : <ChevronDown size={18} color={theme.textMuted} />}
              </button>

              {aberto && (
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
                    <div className="rounded-lg p-3 mb-3" style={{ background: theme.card2 }}>
                      <div className="flex items-center justify-between mb-1">
                        <MotoPlate placa={motoVinculada.placa} />
                        <span style={{ color: theme.amber, fontFamily: HEAD_FONT, fontSize: 17 }}>
                          {formatCurrency(motoVinculada.contratoAtual.valorMensal)}/mês
                        </span>
                      </div>
                      <div style={{ color: theme.textMuted, fontSize: 12 }}>
                        Contrato nº {motoVinculada.contratoAtual.numeroContrato} · vence em {formatDate(motoVinculada.contratoAtual.dataVencimento)}
                      </div>
                    </div>
                  )}

                  {!motoVinculada && (
                    <button
                      onClick={() => setModal({ mode: "vincular", cliente: c })}
                      className="text-xs font-semibold rounded-lg px-3 py-1.5 mb-2"
                      style={{ background: theme.amber, color: theme.mintText }}
                    >
                      Vincular a uma moto disponível
                    </button>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => setModal({ mode: "editar", cliente: c })}
                      className="text-xs font-semibold rounded-lg px-3 py-1.5 flex items-center gap-1"
                      style={{ border: `1px solid ${theme.cardBorder}`, color: theme.text }}
                    >
                      <Pencil size={12} /> Editar
                    </button>
                    {!motoVinculada && (
                      <button
                        onClick={() => excluir(c.id)}
                        className="text-xs font-semibold rounded-lg px-3 py-1.5 flex items-center gap-1"
                        style={{ border: `1px solid ${theme.cardBorder}`, color: theme.coral }}
                      >
                        <Trash2 size={12} /> Excluir
                      </button>
                    )}
                  </div>
                </div>
              )}
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
    notaFiscalLink: "",
    notaFiscalArquivo: "",
    status: "preparacao",
    contratoAtual: null,
    historicoContratos: [],
    manutencoes: [],
  };
}

function MotoFormModal({ moto, onClose, onSave, title }) {
  const [form, setForm] = useState(moto);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal title={title} onClose={onClose}>
      <FieldLabel>Modelo</FieldLabel>
      <input style={inputStyle} value={form.modelo} onChange={set("modelo")} placeholder="JTZ/DK160 S" />
      <Row2>
        <div>
          <FieldLabel>Placa</FieldLabel>
          <input style={inputStyle} value={form.placa} onChange={set("placa")} />
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
      <AnexoField
        label="Nota fiscal da moto"
        linkValue={form.notaFiscalLink}
        onLinkChange={(v) => setForm({ ...form, notaFiscalLink: v })}
        storageKey={`mobirelli-arquivo-nf-${form.id}`}
        fileName={form.notaFiscalArquivo}
        onFileNameChange={(name) => setForm({ ...form, notaFiscalArquivo: name })}
      />
      <button onClick={() => onSave(form)} className="w-full rounded-lg py-2 font-semibold mt-1" style={{ background: theme.mint, color: theme.mintText }}>
        Salvar
      </button>
    </Modal>
  );
}

function ContratoModal({ moto, clientes, onClose, onSave }) {
  const [contratoId] = useState(uid());
  const [clienteId, setClienteId] = useState("novo");
  const [novoCliente, setNovoCliente] = useState(emptyCliente());
  const nContratoDefault = (moto.historicoContratos?.length || 0) + 1;
  const [contrato, setContrato] = useState({
    numeroContrato: nContratoDefault,
    numeroClienteMoto: nContratoDefault,
    valorMensal: "",
    formaPagamento: "Boleto Bancário",
    dataInicio: todayISO(),
    dataVencimento: "",
    contratoLink: "",
    contratoArquivo: "",
  });

  const setNC = (k) => (e) => setNovoCliente({ ...novoCliente, [k]: e.target.value });
  const setC = (k) => (e) => setContrato({ ...contrato, [k]: e.target.value });

  return (
    <Modal title={`Novo contrato — ${moto.placa || moto.modelo}`} onClose={onClose}>
      <FieldLabel>Cliente</FieldLabel>
      <SelectField
        value={clienteId}
        onChange={(e) => setClienteId(e.target.value)}
        options={[{ value: "novo", label: "+ Cadastrar novo cliente" }, ...clientes.map((c) => ({ value: c.id, label: c.nome || "Sem nome" }))]}
      />

      {clienteId === "novo" ? (
        <div className="rounded-lg p-3 mb-2" style={{ background: theme.card2 }}>
          <FieldLabel>Nome completo</FieldLabel>
          <input style={inputStyle} value={novoCliente.nome} onChange={setNC("nome")} />
          <FieldLabel>CPF ou CNPJ</FieldLabel>
          <input style={inputStyle} value={novoCliente.cpfCnpj} onChange={setNC("cpfCnpj")} />
          <Row2>
            <div>
              <FieldLabel>Telefone</FieldLabel>
              <input style={inputStyle} value={novoCliente.telefone} onChange={setNC("telefone")} />
            </div>
            <div>
              <FieldLabel>E-mail</FieldLabel>
              <input style={inputStyle} value={novoCliente.email} onChange={setNC("email")} />
            </div>
          </Row2>
          <FieldLabel>CEP</FieldLabel>
          <input style={inputStyle} value={novoCliente.cep} onChange={setNC("cep")} />
          <Row2>
            <div>
              <FieldLabel>Logradouro</FieldLabel>
              <input style={inputStyle} value={novoCliente.logradouro} onChange={setNC("logradouro")} />
            </div>
            <div>
              <FieldLabel>Número</FieldLabel>
              <input style={inputStyle} value={novoCliente.numero} onChange={setNC("numero")} />
            </div>
          </Row2>
          <Row2>
            <div>
              <FieldLabel>Bairro</FieldLabel>
              <input style={inputStyle} value={novoCliente.bairro} onChange={setNC("bairro")} />
            </div>
            <div>
              <FieldLabel>Cidade/UF</FieldLabel>
              <input style={inputStyle} value={novoCliente.cidade} onChange={setNC("cidade")} placeholder="Cidade/UF" />
            </div>
          </Row2>
        </div>
      ) : null}

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
          <FieldLabel>Vencimento</FieldLabel>
          <input type="date" style={inputStyle} value={contrato.dataVencimento} onChange={setC("dataVencimento")} />
        </div>
      </Row2>
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

      <AnexoField
        label="Contrato assinado"
        linkValue={contrato.contratoLink}
        onLinkChange={(v) => setContrato({ ...contrato, contratoLink: v })}
        storageKey={`mobirelli-arquivo-contrato-${contratoId}`}
        fileName={contrato.contratoArquivo}
        onFileNameChange={(name) => setContrato({ ...contrato, contratoArquivo: name })}
      />

      <button
        onClick={() =>
          onSave({
            clienteId,
            novoCliente,
            contrato: { ...contrato, id: contratoId, valorMensal: Number(contrato.valorMensal) || 0 },
          })
        }
        className="w-full rounded-lg py-2 font-semibold mt-1"
        style={{ background: theme.mint, color: theme.mintText }}
      >
        Confirmar aluguel
      </button>
    </Modal>
  );
}

function emptyManutencao() {
  return { id: uid(), data: todayISO(), tipo: "", valorGasto: "", local: "", garantia: false };
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
        className="w-full rounded-lg py-2 font-semibold mt-1"
        style={{ background: theme.mint, color: theme.mintText }}
      >
        Salvar
      </button>
    </Modal>
  );
}

function MotosView({ motos, persist, clientes, persistClientes }) {
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState(null);
  const [modal, setModal] = useState(null);

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

  const filtradas = motos.filter((m) => {
    const q = busca.toLowerCase();
    return !q || [m.placa, m.chassi, m.renavam, m.modelo].some((f) => f?.toLowerCase().includes(q));
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 style={{ fontFamily: HEAD_FONT, fontSize: 22, color: theme.text }}>Motos</h2>
        <button
          onClick={() => setModal({ type: "moto", mode: "novo", moto: emptyMoto() })}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold"
          style={{ background: theme.mint, color: theme.mintText }}
        >
          <Plus size={16} /> Nova moto
        </button>
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
        <div className="rounded-xl p-6 text-center" style={{ background: theme.card, color: theme.textMuted, fontFamily: BODY_FONT }}>
          Nenhuma moto encontrada.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtradas.map((moto) => {
          const vencido = moto.status === "alugada" && isOverdue(moto.contratoAtual?.dataVencimento);
          const cliente = clientes.find((c) => c.id === moto.contratoAtual?.clienteId);
          const aberto = expandido === moto.id;
          return (
            <div key={moto.id} className="rounded-xl overflow-hidden" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
              <button className="w-full flex items-center justify-between px-4 py-3 text-left" onClick={() => setExpandido(aberto ? null : moto.id)}>
                <div className="flex items-center gap-2">
                  <MotoPlate placa={moto.placa} />
                  <div>
                    <div style={{ fontFamily: HEAD_FONT, fontSize: 16, color: theme.text }}>{moto.modelo || "Modelo não informado"}</div>
                    <StatusBadge status={moto.status} vencido={vencido} />
                  </div>
                </div>
                {aberto ? <ChevronUp size={18} color={theme.textMuted} /> : <ChevronDown size={18} color={theme.textMuted} />}
              </button>

              {aberto && (
                <div className="px-4 pb-4 text-sm" style={{ fontFamily: BODY_FONT }}>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-3" style={{ color: theme.textMuted }}>
                    <span>Chassi: {moto.chassi || "—"}</span>
                    <span>Renavam: {moto.renavam || "—"}</span>
                    <span>Compra: {formatDate(moto.dataCompra)}</span>
                    <span>Valor: {formatCurrency(moto.valorCompra)}</span>
                  </div>

                  {(moto.notaFiscalLink || moto.notaFiscalArquivo) && (
                    <a
                      href={moto.notaFiscalLink || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs mb-3"
                      style={{ color: theme.blue }}
                    >
                      <FileText size={12} /> Nota fiscal {moto.notaFiscalArquivo ? `(${moto.notaFiscalArquivo})` : ""}
                    </a>
                  )}

                  {moto.contratoAtual ? (
                    <div className="rounded-lg p-3 mb-3" style={{ background: theme.card2 }}>
                      <div className="flex items-center justify-between mb-1">
                        <span style={{ color: theme.text, fontWeight: 600 }}>{cliente?.nome || "Cliente"}</span>
                        <span style={{ color: theme.amber, fontFamily: HEAD_FONT, fontSize: 17 }}>
                          {formatCurrency(moto.contratoAtual.valorMensal)}/mês
                        </span>
                      </div>
                      <div style={{ color: theme.textMuted, fontSize: 12 }}>
                        {moto.contratoAtual.numeroClienteMoto}º cliente · contrato nº {moto.contratoAtual.numeroContrato} · vence em{" "}
                        {formatDate(moto.contratoAtual.dataVencimento)}
                      </div>
                      {(moto.contratoAtual.contratoLink || moto.contratoAtual.contratoArquivo) && (
                        <a
                          href={moto.contratoAtual.contratoLink || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs mt-1"
                          style={{ color: theme.blue }}
                        >
                          <FileText size={12} /> Contrato {moto.contratoAtual.contratoArquivo ? `(${moto.contratoAtual.contratoArquivo})` : ""}
                        </a>
                      )}
                      <button
                        onClick={() => encerrarContrato(moto)}
                        className="text-xs font-semibold rounded-lg px-3 py-1.5 mt-2"
                        style={{ border: `1px solid ${theme.cardBorder}`, color: theme.text }}
                      >
                        Encerrar contrato
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setModal({ type: "contrato", moto })}
                      className="text-xs font-semibold rounded-lg px-3 py-1.5 mb-3"
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
                      <button onClick={() => setModal({ type: "manutencao", moto })} style={{ color: theme.blue }}>
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

                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setModal({ type: "moto", mode: "editar", moto })}
                      className="text-xs font-semibold rounded-lg px-3 py-1.5 flex items-center gap-1"
                      style={{ border: `1px solid ${theme.cardBorder}`, color: theme.text }}
                    >
                      <Pencil size={12} /> Editar
                    </button>
                    <button
                      onClick={() => excluirMoto(moto.id)}
                      className="text-xs font-semibold rounded-lg px-3 py-1.5 flex items-center gap-1"
                      style={{ border: `1px solid ${theme.cardBorder}`, color: theme.coral }}
                    >
                      <Trash2 size={12} /> Excluir
                    </button>
                  </div>
                </div>
              )}
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
        <ContratoModal moto={modal.moto} clientes={clientes} onClose={() => setModal(null)} onSave={(dados) => confirmarContrato(modal.moto, dados)} />
      )}
      {modal?.type === "manutencao" && (
        <ManutencaoModal onClose={() => setModal(null)} onSave={(m) => salvarManutencao(modal.moto, m)} />
      )}
    </div>
  );
}

/* ===========================================================
   FLUXO DE CAIXA
=========================================================== */
const NATUREZAS = ["Operacional", "Administrativo", "Expansão"];

function emptyLancamento() {
  return { id: uid(), data: todayISO(), tipo: "entrada", natureza: "Operacional", categoria: "", valor: "", descricao: "", forma: "" };
}

function LancamentoModal({ lancamento, onClose, onSave }) {
  const [form, setForm] = useState(lancamento);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal title="Novo lançamento" onClose={onClose}>
      <div className="flex gap-2 mb-3">
        {["entrada", "saida"].map((t) => (
          <button
            key={t}
            onClick={() => setForm({ ...form, tipo: t })}
            className="flex-1 rounded-lg py-2 text-sm font-semibold"
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
      <FieldLabel>Descrição (opcional)</FieldLabel>
      <input style={inputStyle} value={form.descricao} onChange={set("descricao")} />
      <button
        onClick={() => onSave({ ...form, valor: Number(form.valor) || 0 })}
        className="w-full rounded-lg py-2 font-semibold mt-1"
        style={{ background: theme.mint, color: theme.mintText }}
      >
        Salvar
      </button>
    </Modal>
  );
}

function FluxoCaixaView({ lancamentos, persist }) {
  const [modal, setModal] = useState(null);

  const salvar = async (l) => {
    const existe = lancamentos.find((x) => x.id === l.id);
    const next = existe ? lancamentos.map((x) => (x.id === l.id ? l : x)) : [...lancamentos, l];
    await persist(next);
    setModal(null);
  };

  const excluir = async (id) => persist(lancamentos.filter((x) => x.id !== id));
  const ordenados = [...lancamentos].sort((a, b) => (a.data < b.data ? 1 : -1));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontFamily: HEAD_FONT, fontSize: 22, color: theme.text }}>Fluxo de caixa</h2>
        <button
          onClick={() => setModal(emptyLancamento())}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold"
          style={{ background: theme.mint, color: theme.mintText }}
        >
          <Plus size={16} /> Novo
        </button>
      </div>

      {ordenados.length === 0 && (
        <div className="rounded-xl p-6 text-center" style={{ background: theme.card, color: theme.textMuted, fontFamily: BODY_FONT, border: `1px solid ${theme.cardBorder}` }}>
          Nenhum lançamento ainda.
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${theme.cardBorder}` }}>
        {ordenados.map((l) => (
          <div key={l.id} className="flex items-center justify-between px-4 py-3" style={{ background: theme.card, borderBottom: `1px solid ${theme.cardBorder}` }}>
            <div>
              <div style={{ color: theme.text, fontFamily: BODY_FONT, fontWeight: 600 }}>{l.categoria || "Sem categoria"}</div>
              <div style={{ color: theme.textMuted, fontFamily: BODY_FONT, fontSize: 12 }}>
                {formatDate(l.data)} · {l.natureza} {l.descricao ? `· ${l.descricao}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span style={{ color: l.tipo === "entrada" ? theme.mint : theme.coral, fontFamily: HEAD_FONT, fontSize: 16 }}>
                {l.tipo === "entrada" ? "+" : "-"} {formatCurrency(l.valor)}
              </span>
              <button onClick={() => excluir(l.id)} style={{ color: theme.textMuted }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal && <LancamentoModal lancamento={modal} onClose={() => setModal(null)} onSave={salvar} />}
    </div>
  );
}

/* ===========================================================
   DASHBOARD
=========================================================== */
function DashboardView({ motos, lancamentos, clientes }) {
  const alugadas = motos.filter((m) => m.status === "alugada").length;
  const disponiveis = motos.filter((m) => m.status === "disponivel").length;
  const motosVencidas = motos.filter((m) => m.status === "alugada" && isOverdue(m.contratoAtual?.dataVencimento));
  const vencidas = motosVencidas.length;

  const todasManutencoes = motos.flatMap((m) => m.manutencoes || []);

  const now = new Date();
  const mesCalendario = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const mesesComDados = new Set(
    [...lancamentos.map((l) => l.data?.slice(0, 7)), ...todasManutencoes.map((m) => m.data?.slice(0, 7))].filter(Boolean)
  );
  // usa o mês atual se ele já tiver algum lançamento; senão, cai pro mês mais recente com dados
  // (evita mostrar "Lucro do mês" zerado só porque ainda não lançou nada no mês corrente)
  const mesRef = mesesComDados.has(mesCalendario) ? mesCalendario : [...mesesComDados].sort().pop() || mesCalendario;
  const noMes = (data) => data?.slice(0, 7) === mesRef;
  const rotuloMes = monthLabel(mesRef);

  const entradasMes = lancamentos.filter((l) => l.tipo === "entrada" && noMes(l.data)).reduce((s, l) => s + Number(l.valor), 0);
  const saidasOperacionaisMes = lancamentos
    .filter((l) => l.tipo === "saida" && l.natureza !== "Expansão" && noMes(l.data))
    .reduce((s, l) => s + Number(l.valor), 0);
  const manutencaoMes = todasManutencoes.filter((m) => noMes(m.data)).reduce((s, m) => s + Number(m.valorGasto), 0);
  const saidasMes = saidasOperacionaisMes + manutencaoMes;
  const lucroMes = entradasMes - saidasMes;
  const margemLucro = entradasMes > 0 ? (lucroMes / entradasMes) * 100 : 0;

  const [refAno, refMesNum] = mesRef.split("-").map(Number);
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(refAno, refMesNum - 1 - i, 1);
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const chartData = meses.map((key) => {
    const doMesX = lancamentos.filter((l) => l.data?.slice(0, 7) === key);
    const manut = todasManutencoes.filter((m) => m.data?.slice(0, 7) === key).reduce((s, m) => s + Number(m.valorGasto), 0);
    return {
      mes: monthLabel(key),
      Entradas: doMesX.filter((l) => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0),
      Saídas: doMesX.filter((l) => l.tipo === "saida" && l.natureza !== "Expansão").reduce((s, l) => s + Number(l.valor), 0) + manut,
      Investimentos: doMesX.filter((l) => l.tipo === "saida" && l.natureza === "Expansão").reduce((s, l) => s + Number(l.valor), 0),
    };
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

  return (
    <div>
      <h2 style={{ fontFamily: HEAD_FONT, fontSize: 22, color: theme.text }} className="mb-4">
        Visão geral
      </h2>

      {vencidas > 0 && (
        <div className="rounded-xl p-4 mb-4" style={{ background: `${theme.coral}1F`, border: `1px solid ${theme.coral}` }}>
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
                  {m.placa} · {clienteNome(m.contratoAtual.clienteId)}
                </span>
                <span style={{ color: theme.coral }}>venceu em {formatDate(m.contratoAtual.dataVencimento)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <StatCard label="Motos" value={motos.length} icon={Bike} />
        <StatCard label="Alugadas" value={alugadas} icon={Bike} accent={theme.amber} />
        <StatCard label="Disponíveis" value={disponiveis} icon={CheckCircle2} accent={theme.mint} />
        <StatCard label="Vencidos" value={vencidas} icon={AlertTriangle} accent={vencidas > 0 ? theme.coral : theme.textMuted} />
      </div>

      <div className="grid gap-3 mb-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <StatCard label={`Faturamento (${rotuloMes})`} value={formatCurrency(entradasMes)} icon={TrendingUp} accent={theme.mint} />
        <StatCard label="Faturamento previsto/mês" value={formatCurrency(faturamentoPrevisto)} icon={TrendingUp} accent={theme.blue} />
        <StatCard label={`Gastos operacionais (${rotuloMes})`} value={formatCurrency(saidasMes)} icon={TrendingDown} accent={theme.coral} />
        <StatCard
          label={`${lucroMes >= 0 ? "Lucro" : "Prejuízo"} (${rotuloMes})`}
          value={formatCurrency(Math.abs(lucroMes))}
          icon={Wallet}
          accent={lucroMes >= 0 ? theme.mint : theme.coral}
        />
        <StatCard
          label={`Margem de lucro (${rotuloMes})`}
          value={entradasMes > 0 ? `${margemLucro.toFixed(1)}%` : "—"}
          icon={lucroMes >= 0 ? TrendingUp : TrendingDown}
          accent={lucroMes >= 0 ? theme.mint : theme.coral}
        />
      </div>
      {mesRef !== mesCalendario && (
        <div className="text-xs mb-4" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
          Ainda não há lançamentos em {monthLabel(mesCalendario)} — mostrando o último mês com movimento.
        </div>
      )}

      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <StatCard label="Taxa de ocupação" value={`${taxaOcupacao}%`} icon={Bike} accent={theme.amber} />
        <StatCard label="Ticket médio" value={formatCurrency(ticketMedio)} icon={Wallet} accent={theme.mint} />
        <StatCard label="Investido em frota" value={formatCurrency(investimentoFrota)} icon={TrendingUp} accent={theme.blue} />
      </div>

      <div className="rounded-xl p-4 mb-4" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
        <div className="flex items-center justify-between flex-wrap gap-1 mb-1">
          <h3 style={{ fontFamily: HEAD_FONT, fontSize: 16, color: theme.text }}>Entradas x Saídas (últimos 6 meses)</h3>
        </div>
        <div className="flex gap-4 mb-3 text-xs flex-wrap" style={{ fontFamily: BODY_FONT }}>
          <span style={{ color: theme.mint }}>Entradas no período: {formatCurrency(chartData.reduce((s, d) => s + d.Entradas, 0))}</span>
          <span style={{ color: theme.coral }}>Saídas no período: {formatCurrency(chartData.reduce((s, d) => s + d.Saídas, 0))}</span>
          <span style={{ color: theme.blue }}>Investido no período: {formatCurrency(chartData.reduce((s, d) => s + d.Investimentos, 0))}</span>
        </div>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.cardBorder} />
              <XAxis dataKey="mes" stroke={theme.textMuted} fontSize={12} />
              <YAxis stroke={theme.textMuted} fontSize={11} tickFormatter={formatCompact} width={64} />
              <Tooltip
                formatter={(value, name) => [formatCurrency(value), name]}
                contentStyle={{ background: theme.panel, border: `1px solid ${theme.cardBorder}`, color: theme.text }}
              />
              <Legend />
              <Bar dataKey="Entradas" fill={theme.mint} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Saídas" fill={theme.coral} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Investimentos" fill={theme.blue} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col gap-1.5 mt-3 pt-3" style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
          {chartData.map((m) => (
            <div key={m.mes} className="flex items-center justify-between text-xs" style={{ fontFamily: BODY_FONT }}>
              <span style={{ color: theme.textMuted }}>{m.mes}</span>
              <span>
                <span style={{ color: theme.mint }}>+{formatCurrency(m.Entradas)}</span>{" "}
                <span style={{ color: theme.coral }}>-{formatCurrency(m.Saídas)}</span>
                {m.Investimentos > 0 && <span style={{ color: theme.blue }}> · inv. {formatCurrency(m.Investimentos)}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div className="rounded-xl p-4" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
          <h3 style={{ fontFamily: HEAD_FONT, fontSize: 16, color: theme.text }} className="mb-3">
            Gastos por natureza (total)
          </h3>
          <div className="flex flex-col gap-2">
            {porNatureza.map((n) => (
              <div key={n.natureza}>
                <div className="flex justify-between text-xs mb-1" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
                  <span>{n.natureza}</span>
                  <span>{formatCurrency(n.total)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: theme.bg, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(n.total / maxNatureza) * 100}%`, background: theme.amber }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {rankingManutencao.length > 0 && (
          <div className="rounded-xl p-4" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
            <h3 style={{ fontFamily: HEAD_FONT, fontSize: 16, color: theme.text }} className="mb-3">
              Maiores gastos de manutenção
            </h3>
            <div className="flex flex-col gap-2">
              {rankingManutencao.map((m) => (
                <div key={m.placa}>
                  <div className="flex justify-between text-xs mb-1" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
                    <span>{m.placa}</span>
                    <span>{formatCurrency(m.total)}</span>
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
    </div>
  );
}

/* ===========================================================
   CONFIGURAÇÕES — logo própria + cores do site
=========================================================== */
function ConfiguracoesView({ config, persist }) {
  const [local, setLocal] = useState(config);
  const [status, setStatus] = useState({ text: "", kind: "" }); // kind: "ok" | "erro" | ""
  const logoInputRef = useRef(null);

  // se outra pessoa (ex. seu pai) mudar as configurações, reflete aqui
  useEffect(() => {
    setLocal(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.bg, config.accent, config.brand, config.logoDataUrl]);

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
      const url = await uploadArquivo(`logo-${Date.now()}-${file.name}`, file);
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
  const aplicarCores = () => salvarAgora(local);

  const restaurarCores = () => {
    const next = { ...local, bg: "", accent: "", brand: "" };
    setLocal(next);
    salvarAgora(next);
  };

  return (
    <div>
      <h2 style={{ fontFamily: HEAD_FONT, fontSize: 22, color: theme.text }} className="mb-4">
        Configurações
      </h2>

      <div className="rounded-xl p-4 mb-4" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
        <FieldLabel>Logo da empresa</FieldLabel>
        <div className="flex items-center gap-3 mb-2">
          <div
            className="flex items-center justify-center rounded-lg"
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
              className="text-xs font-semibold rounded-lg px-3 py-1.5"
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
        <div className="text-xs" style={{ color: theme.textMuted, fontFamily: BODY_FONT }}>
          PNG com fundo transparente funciona melhor. Até 5MB.
        </div>
      </div>

      <div className="rounded-xl p-4 mb-4" style={{ background: theme.card, border: `1px solid ${theme.cardBorder}` }}>
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
        <div className="flex items-center justify-between py-2">
          <span style={{ color: theme.text, fontFamily: BODY_FONT, fontSize: 14 }}>Cor da marca (wordmark, links)</span>
          <input
            type="color"
            value={local.brand || DEFAULT_THEME.mint}
            onChange={setCorLocal("brand")}
            onBlur={aplicarCores}
            style={{ width: 40, height: 30, background: "none", border: "none" }}
          />
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={aplicarCores}
            className="text-xs font-semibold rounded-lg px-3 py-1.5"
            style={{ background: theme.mint, color: theme.mintText }}
          >
            Aplicar cores
          </button>
          <button
            onClick={restaurarCores}
            className="text-xs font-semibold rounded-lg px-3 py-1.5"
            style={{ border: `1px solid ${theme.cardBorder}`, color: theme.text }}
          >
            Restaurar padrão
          </button>
        </div>
      </div>

      {status.text && (
        <div
          className="text-xs font-semibold rounded-lg px-3 py-2 inline-block"
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
    dataCompra: "2026-05-08", nfNumero: "000009496", valorCompra: 17372.64, notaFiscalLink: "", notaFiscalArquivo: "", status: "alugada",
    contratoAtual: { id: "ctr-urb-1", clienteId: "cli-avant", numeroContrato: 1, numeroClienteMoto: 1, dataInicio: "", dataVencimento: "", valorMensal: 1590, formaPagamento: "Boleto Bancário", contratoLink: "", contratoArquivo: "" },
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
    dataCompra: "2026-06-11", nfNumero: "000009841", valorCompra: 15880.31, notaFiscalLink: "", notaFiscalArquivo: "", status: "alugada",
    contratoAtual: { id: "ctr-uoi-2", clienteId: "cli-andre", numeroContrato: 2, numeroClienteMoto: 2, dataInicio: "", dataVencimento: "", valorMensal: 1428, formaPagamento: "Boleto Bancário", contratoLink: "", contratoArquivo: "" },
    historicoContratos: [
      { id: "ctr-uoi-1", clienteId: "cli-maicon", numeroContrato: 1, numeroClienteMoto: 1, dataInicio: "", dataVencimento: "", valorMensal: 1600, formaPagamento: "Boleto Bancário", contratoLink: "", contratoArquivo: "", encerradoEm: "" },
    ],
    manutencoes: [{ id: "mnt-uoi-1", data: "2026-07-01", tipo: "Troca de Óleo", valorGasto: 60, local: "F. M. Basses Motopeças", garantia: false }],
  },
  {
    id: "moto-uou1d13", modelo: "JTZ/DK160 S", placa: "UOU1D13", chassi: "99KPCKBCJVM220650", renavam: "1501043355",
    dataCompra: "2026-06-27", nfNumero: "000009981", valorCompra: 15810.31, notaFiscalLink: "", notaFiscalArquivo: "", status: "alugada",
    contratoAtual: { id: "ctr-uou-1", clienteId: "cli-celio", numeroContrato: 1, numeroClienteMoto: 1, dataInicio: "", dataVencimento: "", valorMensal: 1600, formaPagamento: "Boleto Bancário", contratoLink: "", contratoArquivo: "" },
    historicoContratos: [],
    manutencoes: [],
  },
  {
    id: "moto-uon6i43", modelo: "JTZ/DK160 S", placa: "UON6I43", chassi: "99KPCKBCJVM220655", renavam: "1501070379",
    dataCompra: "2026-06-27", nfNumero: "000009982", valorCompra: 15810.31, notaFiscalLink: "", notaFiscalArquivo: "", status: "alugada",
    contratoAtual: { id: "ctr-uon-1", clienteId: "cli-luciano", numeroContrato: 1, numeroClienteMoto: 1, dataInicio: "", dataVencimento: "", valorMensal: 1440, formaPagamento: "Boleto Bancário", contratoLink: "", contratoArquivo: "" },
    historicoContratos: [],
    manutencoes: [{ id: "mnt-uon-1", data: "2026-07-08", tipo: "Pneu", valorGasto: 160, local: "Turella Com. Motopeças", garantia: false }],
  },
  {
    id: "moto-uoo1a56", modelo: "JTZ/DK160 S", placa: "UOO1A56", chassi: "99KPCKBCJVM220675", renavam: "1503860997",
    dataCompra: "2026-07-16", nfNumero: "000010159", valorCompra: 15810.31, notaFiscalLink: "", notaFiscalArquivo: "", status: "alugada",
    contratoAtual: { id: "ctr-uoo-1", clienteId: "cli-thiago", numeroContrato: 1, numeroClienteMoto: 1, dataInicio: "", dataVencimento: "", valorMensal: 1400, formaPagamento: "Boleto Bancário", contratoLink: "", contratoArquivo: "" },
    historicoContratos: [],
    manutencoes: [],
  },
  {
    id: "moto-upm5c78", modelo: "JTZ/DK160 S", placa: "UPM5C78", chassi: "99KPCKBCJVM220331", renavam: "1503855217",
    dataCompra: "2026-07-16", nfNumero: "000010158", valorCompra: 15810.31, notaFiscalLink: "", notaFiscalArquivo: "", status: "preparacao",
    contratoAtual: null,
    historicoContratos: [],
    manutencoes: [],
  },
];

const SEED_FLUXO = [
  { id: "flx-1", tipo: "saida", natureza: "Administrativo", data: "2026-05-03", categoria: "LR Moraes", forma: "", valor: 450, descricao: "" },
  { id: "flx-2", tipo: "saida", natureza: "Administrativo", data: "2026-05-06", categoria: "Consultoria Rogerio", forma: "Pix Fê", valor: 45000, descricao: "" },
  { id: "flx-3", tipo: "saida", natureza: "Administrativo", data: "2026-05-06", categoria: "Abertura Empresa (LR Moraes)", forma: "Pix Itau FÊ", valor: 1700, descricao: "" },
  { id: "flx-4", tipo: "saida", natureza: "Administrativo", data: "2026-05-12", categoria: "Consultoria Rogerio", forma: "Pix Fê", valor: 25000, descricao: "" },
  { id: "flx-5", tipo: "saida", natureza: "Administrativo", data: "2026-05-15", categoria: "Corpo de Bombeiros", forma: "", valor: 600, descricao: "" },
  { id: "flx-6", tipo: "saida", natureza: "Administrativo", data: "2026-05-22", categoria: "Certificado Digital", forma: "", valor: 230, descricao: "" },
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
  const motosState = useSharedList("mobirelli-motos");
  const clientesState = useSharedList("mobirelli-clientes");
  const fluxoState = useSharedList("mobirelli-fluxo-caixa");
  const configState = useSharedObject("mobirelli-config", {});

  // recalcula o tema ativo (mutando o objeto compartilhado) a partir das configurações salvas —
  // como nenhum componente aqui usa memo, todo mundo lê os valores atualizados no próximo render
  Object.assign(theme, buildTheme(configState.value));

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
    { id: "config", label: "Ajustes", icon: Settings },
  ];

  return (
    <div style={{ background: theme.bg, minHeight: "100vh", fontFamily: BODY_FONT }}>
      <style>{`
        ${fontImport}
        * { -webkit-tap-highlight-color: transparent; }
        button { transition: opacity 0.15s ease, transform 0.1s ease; cursor: pointer; }
        button:active { transform: scale(0.97); opacity: 0.85; }
        input, select, textarea, button { font-family: ${BODY_FONT}; }
        input:focus, select:focus, textarea:focus, button:focus-visible {
          outline: 2px solid ${theme.mint}; outline-offset: 1px;
        }
        @media (prefers-reduced-motion: reduce) {
          * { transition: none !important; animation: none !important; }
        }
        @keyframes mbrPulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.9; } }
        .mbr-skel { animation: mbrPulse 1.3s ease-in-out infinite; border-radius: 10px; background: ${theme.card}; }
      `}</style>

      <header
        className="px-4 sm:px-8 py-3 flex items-center justify-between sticky top-0 z-40"
        style={{ background: theme.panel, borderBottom: `1px solid ${theme.cardBorder}` }}
      >
        <Wordmark logoDataUrl={configState.value.logoDataUrl} />
        {anyError && (
          <span className="text-xs" style={{ color: theme.coral, fontFamily: BODY_FONT }}>
            {anyError}
          </span>
        )}
      </header>

      <main className="px-4 sm:px-8 pt-5 max-w-5xl mx-auto" style={{ paddingBottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}>
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
          <>
            {tab === "dashboard" ? (
              <DashboardView motos={motosState.items} lancamentos={fluxoState.items} clientes={clientesState.items} />
            ) : tab === "motos" ? (
              <MotosView motos={motosState.items} persist={motosState.persist} clientes={clientesState.items} persistClientes={clientesState.persist} />
            ) : tab === "clientes" ? (
              <ClientesView
                clientes={clientesState.items}
                persistClientes={clientesState.persist}
                motos={motosState.items}
                persistMotos={motosState.persist}
              />
            ) : tab === "fluxo" ? (
              <FluxoCaixaView lancamentos={fluxoState.items} persist={fluxoState.persist} />
            ) : (
              <ConfiguracoesView config={configState.value} persist={configState.persist} />
            )}
          </>
        )}
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-around"
        style={{
          background: theme.panel,
          borderTop: `1px solid ${theme.cardBorder}`,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2.5"
              style={{ color: active ? theme.mint : theme.textMuted, background: "none" }}
            >
              <Icon size={19} strokeWidth={active ? 2.4 : 2} />
              <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500, fontFamily: BODY_FONT }}>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
