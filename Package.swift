// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "PokerCalculator",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "PokerCore", targets: ["PokerCore"]),
        .executable(name: "PokerCalculator", targets: ["PokerCalculator"]),
    ],
    targets: [
        .target(name: "PokerCore"),
        .executableTarget(name: "PokerCalculator", dependencies: ["PokerCore"]),
        .testTarget(name: "PokerCoreTests", dependencies: ["PokerCore"]),
    ]
)
