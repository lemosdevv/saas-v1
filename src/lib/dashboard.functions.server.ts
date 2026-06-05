import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware.server";

type AppointmentRow = {
  id?: string;
  status: string | null;
  preco: number | string | null;
  inicio: string;
  cliente_id?: string | null;
  servico_id?: string | null;
  profissional_id?: string | null;
};

type ReportRow = {
  inicio: string;
  preco: number | string | null;
  status: string | null;
  servico_id?: string | null;
  profissional_id?: string | null;
};

export const getDashboardStats = createServerFn({ method: "POST" }).handler(
  async () => {
    const { supabase } = await requireSupabaseAuth();

    const now = new Date();

    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).toISOString();

    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    ).toISOString();

    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();

    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
    ).toISOString();

    const [todayAg, monthAg, clientes, servicos, nextAg] = await Promise.all([
      supabase
        .from("agendamentos")
        .select("id,status,preco,inicio,cliente_id,servico_id,profissional_id", {
          count: "exact",
        })
        .gte("inicio", startOfDay)
        .lt("inicio", endOfDay)
        .order("inicio"),

      supabase
        .from("agendamentos")
        .select("preco,status")
        .gte("inicio", startOfMonth)
        .lt("inicio", endOfMonth),

      supabase.from("clientes").select("id", {
        count: "exact",
        head: true,
      }),

      supabase
        .from("servicos")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("ativo", true),

      supabase
        .from("agendamentos")
        .select("id,inicio,cliente_id,servico_id")
        .gte("inicio", new Date().toISOString())
        .order("inicio")
        .limit(5),
    ]);

    const monthRows = (monthAg.data ?? []) as AppointmentRow[];

    const receitaMes = monthRows
      .filter(
        (a: AppointmentRow) =>
          a.status === "concluido" || a.status === "confirmado",
      )
      .reduce(
        (acc: number, a: AppointmentRow) => acc + Number(a.preco ?? 0),
        0,
      );

    return {
      agendamentosHoje: todayAg.count ?? 0,
      agendamentosHojeList: (todayAg.data ?? []) as AppointmentRow[],
      totalClientes: clientes.count ?? 0,
      servicosAtivos: servicos.count ?? 0,
      receitaMes,
      proximos: (nextAg.data ?? []) as AppointmentRow[],
    };
  },
);

export const getReports = createServerFn({ method: "POST" }).handler(
  async () => {
    const { supabase } = await requireSupabaseAuth();

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data: ags } = await supabase
      .from("agendamentos")
      .select("inicio,preco,status,servico_id,profissional_id")
      .gte("inicio", since.toISOString())
      .order("inicio");

    const rows = (ags ?? []) as ReportRow[];

    const concluidos = rows.filter((r: ReportRow) => r.status === "concluido");
    const cancelados = rows.filter((r: ReportRow) => r.status === "cancelado");
    const faltas = rows.filter((r: ReportRow) => r.status === "faltou");

    const receita = concluidos.reduce(
      (acc: number, r: ReportRow) => acc + Number(r.preco ?? 0),
      0,
    );

    const byDay = new Map<string, { count: number; receita: number }>();

    for (const r of rows) {
      const d = r.inicio.slice(0, 10);
      const cur = byDay.get(d) ?? {
        count: 0,
        receita: 0,
      };

      cur.count += 1;

      if (r.status === "concluido") {
        cur.receita += Number(r.preco ?? 0);
      }

      byDay.set(d, cur);
    }

    const serie = Array.from(byDay.entries()).map(([d, v]) => ({
      data: d,
      ...v,
    }));

    return {
      total: rows.length,
      concluidos: concluidos.length,
      cancelados: cancelados.length,
      faltas: faltas.length,
      receita,
      ticketMedio: concluidos.length ? receita / concluidos.length : 0,
      serie,
    };
  },
);