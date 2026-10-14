import AppKit

enum IconError: Error {
    case usage, bitmap, encoding
}

guard CommandLine.arguments.count == 2 else { throw IconError.usage }
let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

func drawIcon() {
    let background = NSBezierPath(roundedRect: NSRect(x: 48, y: 48, width: 928, height: 928), xRadius: 206, yRadius: 206)
    NSColor(calibratedRed: 0.055, green: 0.12, blue: 0.17, alpha: 1).setFill()
    background.fill()

    let chip = NSBezierPath(ovalIn: NSRect(x: 159, y: 159, width: 706, height: 706))
    NSColor(calibratedRed: 0.13, green: 0.69, blue: 0.63, alpha: 1).setFill()
    chip.fill()
    NSColor(calibratedRed: 0.055, green: 0.27, blue: 0.29, alpha: 1).setStroke()
    chip.lineWidth = 22
    chip.stroke()

    NSColor(calibratedWhite: 0.93, alpha: 1).setStroke()
    for angle in stride(from: 0.0, to: 360.0, by: 45.0) {
        let radians = angle * .pi / 180
        let line = NSBezierPath()
        line.move(to: NSPoint(x: 512 + cos(radians) * 307, y: 512 + sin(radians) * 307))
        line.line(to: NSPoint(x: 512 + cos(radians) * 335, y: 512 + sin(radians) * 335))
        line.lineWidth = 24
        line.lineCapStyle = .round
        line.stroke()
    }

    NSColor(calibratedWhite: 0.97, alpha: 1).setFill()
    NSBezierPath(roundedRect: NSRect(x: 310, y: 262, width: 404, height: 500), xRadius: 48, yRadius: 48).fill()
    NSColor(calibratedRed: 0.055, green: 0.12, blue: 0.17, alpha: 1).setFill()
    let spade = NSBezierPath()
    spade.move(to: NSPoint(x: 512, y: 672))
    spade.curve(to: NSPoint(x: 399, y: 530), controlPoint1: NSPoint(x: 475, y: 624), controlPoint2: NSPoint(x: 399, y: 593))
    spade.curve(to: NSPoint(x: 497, y: 501), controlPoint1: NSPoint(x: 399, y: 471), controlPoint2: NSPoint(x: 465, y: 457))
    spade.curve(to: NSPoint(x: 478, y: 443), controlPoint1: NSPoint(x: 496, y: 472), controlPoint2: NSPoint(x: 486, y: 454))
    spade.line(to: NSPoint(x: 546, y: 443))
    spade.curve(to: NSPoint(x: 527, y: 501), controlPoint1: NSPoint(x: 538, y: 454), controlPoint2: NSPoint(x: 528, y: 472))
    spade.curve(to: NSPoint(x: 625, y: 530), controlPoint1: NSPoint(x: 559, y: 457), controlPoint2: NSPoint(x: 625, y: 471))
    spade.curve(to: NSPoint(x: 512, y: 672), controlPoint1: NSPoint(x: 625, y: 593), controlPoint2: NSPoint(x: 549, y: 624))
    spade.close()
    spade.fill()

    NSColor(calibratedRed: 0.055, green: 0.43, blue: 0.41, alpha: 1).setFill()
    for (index, width) in [72.0, 110.0, 148.0].enumerated() {
        NSBezierPath(roundedRect: NSRect(x: 384, y: 318 + Double(index) * 32, width: width, height: 16), xRadius: 8, yRadius: 8).fill()
    }
}

for points in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = points * scale
        guard let bitmap = NSBitmapImageRep(
            bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels,
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
            isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
        ), let context = NSGraphicsContext(bitmapImageRep: bitmap) else { throw IconError.bitmap }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        context.cgContext.scaleBy(x: CGFloat(pixels) / 1024, y: CGFloat(pixels) / 1024)
        drawIcon()
        NSGraphicsContext.restoreGraphicsState()
        guard let png = bitmap.representation(using: .png, properties: [:]) else { throw IconError.encoding }
        let suffix = scale == 2 ? "@2x" : ""
        try png.write(to: directory.appendingPathComponent("icon_\(points)x\(points)\(suffix).png"), options: .atomic)
    }
}
