// Código compartilhado entre condicoes.html e gerenciador_condicoes.html.
const SUPABASE_URL = "https://drkcfrhjgkztdtneuofr.supabase.co";
const SUPABASE_KEY = "sb_publishable_qza2ryuCGa1OznotsuKjUw_i2uH1IlY";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);
const esc = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const ordenarPorNome = (a, b) => a.nome.localeCompare(b.nome, "pt-BR");

function mostrarStatus(texto, erro = false) {
  $("status").textContent = texto;
  $("status").classList.toggle("erro", erro);
}

async function usuarioEhAdmin() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return false;
  const { data, error } = await sb.from("compendio_admins").select("can_edit").eq("user_id", session.user.id).maybeSingle();
  if (error) { console.error(error); return false; }
  return data?.can_edit === true;
}

async function entrar(usuario, senha) {
  const nome = String(usuario || "").trim().toLowerCase();
  const email = nome.includes("@") ? nome : `${nome}@mestre.rpg`;
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error("Usuário ou senha inválidos.");
  if (!await usuarioEhAdmin()) {
    await sb.auth.signOut();
    throw new Error("Esta conta não tem acesso de Mestre.");
  }
}

function ouvirAlteracoes(canal, aoMudar) {
  sb.channel(canal)
    .on("postgres_changes", { event: "*", schema: "public", table: "condicoes" }, aoMudar)
    .subscribe();
}
