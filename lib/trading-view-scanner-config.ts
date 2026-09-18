/** Opções partilhadas do TradingView para scanner-mobile e scanner-access. */

/** Legenda dos indicadores oculta (única restrição visual partilhada). */
export const TV_STUDY_LEGEND_OVERRIDES: Record<string, boolean> = {
  "paneProperties.legendProperties.showStudyTitles": false,
  "paneProperties.legendProperties.showStudyArguments": false,
  "paneProperties.legendProperties.showStudyValues": false,
}

/** Sidebar de desenhos. */
const TV_DRAWING_TOOLBAR_FEATURES = ["left_toolbar", "drawing_toolbar", "control_bar"] as const

/** Barra superior nativa (timeframes, indicadores, símbolo, etc.). */
const TV_TOP_HEADER_FEATURES = [
  "header_widget",
  "header_widget_dom_node",
  "timeframes_toolbar",
  "header_chart_type",
  "header_settings",
  "header_indicators",
  "header_compare",
  "header_undo_redo",
  "header_symbol_search",
  "header_interval_dialog_button",
  "header_resolutions",
  "header_fullscreen_button",
  "header_screenshot",
  "header_saveload_image",
  "header_save_chart",
  "border_around_the_chart",
] as const

/** Só volume automático desativado (scanners MTM). Nunca desativar header_widget aqui. */
const TV_VOLUME_DISABLED = [
  "volume_force_overlay",
  "create_volume_indicator_by_default",
] as const

/** Garantir barra superior visível em fullscreen e layouts compactos. */
const TV_HEADER_ALWAYS_VISIBLE = ["header_in_fullscreen_mode", "side_toolbar_in_fullscreen_mode"] as const

/** app-mobile + barra nativa + desenhos. */
const TV_MOBILE_ENABLED = [
  "study_on_study",
  "use_localstorage_for_settings",
  "context_menus",
  "pane_context_menu",
  "keyboard_shortcuts",
  "symbol_search_hot_key",
  ...TV_TOP_HEADER_FEATURES,
  ...TV_DRAWING_TOOLBAR_FEATURES,
] as const

/** scanner-access — topo + desenhos + snapshot/guardar (lista completa para não ocultar toolbar). */
export const TV_SCANNER_ACCESS_ENABLED_FEATURES = [
  ...TV_TOP_HEADER_FEATURES,
  ...TV_DRAWING_TOOLBAR_FEATURES,
  ...TV_HEADER_ALWAYS_VISIBLE,
  "study_on_study",
  "save_chart_properties_to_local_storage",
  "use_localstorage_for_settings",
  "save_shortcut",
  "keyboard_shortcuts",
  "symbol_search_hot_key",
  "header_saveload",
  "header_load_chart",
  "snapshot_trading_drawings",
  "show_chart_property_page",
  "property_pages",
  "context_menus",
  "pane_context_menu",
  "scales_context_menu",
  "legend_context_menu",
  "header_compare_symbols",
] as const

export type TradingViewScannerMode = "mobile" | "scanner-access"

/** Altura mínima do gráfico em scanner-access. */
export const SCANNER_ACCESS_CHART_MIN_HEIGHT_PX = 800

/**
 * Altura máxima do gráfico: todo o espaço vertical disponível (sem cap 16:9).
 * A toolbar fica dentro do iframe — não alterar enabled_features.
 */
export function computeScannerAccessChartHeight(
  _containerWidth: number,
  viewportMaxHeight: number
): number {
  const available = Math.max(0, viewportMaxHeight)
  return Math.floor(Math.max(SCANNER_ACCESS_CHART_MIN_HEIGHT_PX, available))
}

export type BuildScannerWidgetOptionsInput = {
  mode: TradingViewScannerMode
  symbol: string
  interval: string
  theme: "light" | "dark"
  studies: string[]
  containerId: string
  userId?: string | null
  /** App iOS: sem pesquisa de símbolos no gráfico (a pesquisa do TradingView lista cripto — Apple 3.1.5(iii)). */
  semPesquisaSimbolo?: boolean
  /** scanner-access: dimensões explícitas (toolbar nativa dentro do iframe) */
  width?: number
  height?: number
}

export function buildTradingViewScannerOptions(input: BuildScannerWidgetOptionsInput) {
  const isAccess = input.mode === "scanner-access"

  if (!isAccess) {
    return {
      autosize: true,
      symbol: input.symbol,
      interval: input.interval,
      timezone: "Etc/UTC",
      theme: input.theme,
      style: input.theme === "dark" ? "1" : "9",
      locale: "br",
      toolbar_bg: "#1E1E1E",
      enable_publishing: false,
      allow_symbol_change: !input.semPesquisaSimbolo,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      withdateranges: true,
      container_id: input.containerId,
      studies: input.studies,
      disabled_features: input.semPesquisaSimbolo
        ? [...TV_VOLUME_DISABLED, "header_symbol_search", "symbol_search_hot_key"]
        : [...TV_VOLUME_DISABLED],
      enabled_features: input.semPesquisaSimbolo
        ? TV_MOBILE_ENABLED.filter((f) => f !== "header_symbol_search" && f !== "symbol_search_hot_key")
        : [...TV_MOBILE_ENABLED],
      loading_screen: { backgroundColor: "#1E1E1E", foregroundColor: "#f9b208" },
      overrides: {
        "mainSeriesProperties.showCountdown": true,
        "scalesProperties.showSeriesLastValue": true,
        "scalesProperties.showStudyLastValue": false,
        ...TV_STUDY_LEGEND_OVERRIDES,
        "volumePaneSize": "hide",
        "scalesProperties.autoScale": true,
        "scalesProperties.lockPriceToBarRatio": false,
        "scalesProperties.scaleSeriesOnly": true,
        "scalesProperties.invertScale": false,
      },
    }
  }

  return {
    autosize: true,
    symbol: input.symbol,
    interval: input.interval,
    timezone: "Etc/UTC",
    theme: input.theme,
    style: "1",
    locale: "pt",
    toolbar_bg: input.theme === "dark" ? "#1E1E1E" : "#FFFFFF",
    enable_publishing: true,
    allow_symbol_change: true,
    hide_side_toolbar: false,
    hide_top_toolbar: false,
    hide_legend: false,
    withdateranges: true,
    save_image: true,
    container_id: input.containerId,
    studies: input.studies,
    /* Sem enabled_features: whitelist oculta a toolbar. Snapshot via save_image + API takeScreenshot. */
    disabled_features: [...TV_VOLUME_DISABLED],
    charts_storage_url: "https://saveload.tradingview.com",
    charts_storage_api_version: "1.1",
    client_id: "morethanmoney.pt",
    user_id: input.userId || "public_user_id",
    loading_screen: {
      backgroundColor: input.theme === "dark" ? "#1E1E1E" : "#FFFFFF",
      foregroundColor: "#f9b208",
    },
    overrides: {
      ...TV_STUDY_LEGEND_OVERRIDES,
    },
  }
}
