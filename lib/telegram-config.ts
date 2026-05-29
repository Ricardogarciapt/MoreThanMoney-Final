const isServer = typeof window === "undefined"

// No início do arquivo, adicionar:

// Nas funções que usam variáveis de ambiente:
if (isServer) {
  // Lógica do servidor
} else {
  // Lógica do cliente ou retorno vazio
}
