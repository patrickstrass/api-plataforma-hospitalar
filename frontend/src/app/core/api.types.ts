export type Papel = 'ADMIN' | 'RECEPCAO' | 'MEDICO';
export interface UsuarioToken { id: string; nome: string; papel: Papel }
export interface LoginResponse { accessToken: string; tokenType: 'Bearer'; expiresIn: number; usuario: UsuarioToken }
export interface Pagina<T> { dados: T[]; paginacao: { pagina: number; limite: number; totalItens: number; totalPaginas: number } }
export interface ErroApi { erro: { codigo: string; mensagem: string; detalhes: { campo: string; motivo: string }[]; correlationId: string } }
