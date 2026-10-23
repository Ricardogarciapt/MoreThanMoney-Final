/**
 * Que secções vive em cada painel. Ficheiro sem JSX nem 'use client' para o servidor (o redirect
 * dos links antigos) e o browser lerem a MESMA lista.
 */
export const SECCOES_DO_CLIENTE = ['dashboard', 'contas', 'contratos', 'levantamentos', 'terminal', 'certificados'] as const
export const SECCOES_DO_TORNEIO = ['dashboard', 'competicoes', 'classificacao', 'terminal', 'certificados'] as const
