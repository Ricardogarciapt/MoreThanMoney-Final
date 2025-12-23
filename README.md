# Instruções Stripe

Para pagamentos funcionarem:
1. Crie os produtos no Stripe Dashboard.
2. Adicione os produtos na tabela `products` do Supabase, com os mesmos IDs do Stripe.
3. Configure os webhooks do Stripe para o endpoint do seu projeto. 