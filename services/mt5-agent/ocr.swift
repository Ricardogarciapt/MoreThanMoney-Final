import Foundation
import Vision
import AppKit

// OCR nativo do macOS (framework Vision). Sem serviços externos: as credenciais de uma conta
// nunca saem da máquina.
guard CommandLine.arguments.count > 1,
      let img = NSImage(contentsOfFile: CommandLine.arguments[1]),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("uso: ocr <imagem>\n".data(using: .utf8)!)
    exit(1)
}
let pedido = VNRecognizeTextRequest()
pedido.recognitionLevel = .accurate
pedido.usesLanguageCorrection = false   // credenciais não são palavras: corrigir estraga-as
pedido.recognitionLanguages = ["en-US", "pt-PT"]
let handler = VNImageRequestHandler(cgImage: cg, options: [:])
try? handler.perform([pedido])
// Emite POSIÇÃO e texto. Sem as coordenadas, o Vision devolve as etiquetas todas e depois
// os valores todos — e "Password:" deixa de saber qual é a sua password. Com o y, emparelha-se
// por linha, que é como um humano lê o diálogo.
for obs in (pedido.results ?? []) {
    guard let t = obs.topCandidates(1).first?.string else { continue }
    let b = obs.boundingBox   // 0..1, origem em baixo à esquerda
    // Emite o CENTRO vertical, não o topo. Uma etiqueta com maiúsculas e um número têm caixas
    // de alturas diferentes, e os topos afastam-se o suficiente para "Conta:" deixar de
    // encontrar o número que está mesmo ao lado. Os centros alinham.
    let centro = 1.0 - (b.origin.y + b.height / 2.0)
    print(String(format: "%.4f\t%.4f\t%.4f\t%@", centro, b.origin.x, b.height, t))
}
