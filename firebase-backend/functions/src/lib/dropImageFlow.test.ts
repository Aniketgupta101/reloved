import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { normalizePublicImages, toPublicItem, type ItemDoc } from "../types"

describe("Drop Flow Image Processing & Wall Display Specification", () => {
  it("Image 1 is Gemini AI-photoshopped (modelled) and Image 2 is background-removed original", () => {
    const images = [
      {
        storagePath: "https://storage.googleapis.com/reloved/donations/enhanced/gemini-studio-1.jpg",
        imageType: "modelled",
        sortOrder: 0,
        bgRemoved: true,
      },
      {
        storagePath: "https://storage.googleapis.com/reloved/donations/cutouts/flat-cutout-1.png",
        imageType: "original",
        sortOrder: 1,
        bgRemoved: true,
      },
    ]
    const donorOriginalPaths = [
      "https://storage.googleapis.com/reloved/donations/originals/raw-camera-1.jpg",
    ]

    const normalized = normalizePublicImages(images, donorOriginalPaths)

    assert.equal(normalized.length, 2, "Must produce exactly 2 images for the Wall gallery")
    assert.equal(normalized[0].imageType, "modelled", "Image 1 must be modelled AI studio")
    assert.equal(normalized[0].storagePath, "https://storage.googleapis.com/reloved/donations/enhanced/gemini-studio-1.jpg")
    assert.equal(normalized[0].bgRemoved, true)

    assert.equal(normalized[1].imageType, "original", "Image 2 must be background-removed original")
    assert.equal(normalized[1].storagePath, "https://storage.googleapis.com/reloved/donations/cutouts/flat-cutout-1.png")
    assert.equal(normalized[1].bgRemoved, true)
  })

  it("Preserves raw camera upload and falls back when cutout is still processing", () => {
    // Only modelled AI exists in images[], but donorOriginalPaths has raw upload
    const images = [
      {
        storagePath: "https://storage.googleapis.com/reloved/donations/enhanced/gemini-studio-1.jpg",
        imageType: "modelled",
        sortOrder: 0,
        bgRemoved: true,
      },
    ]
    const donorOriginalPaths = [
      "https://storage.googleapis.com/reloved/donations/originals/raw-camera-1.jpg",
    ]

    const normalized = normalizePublicImages(images, donorOriginalPaths)

    assert.equal(normalized.length, 2, "Must recover raw upload to provide 2 images")
    assert.equal(normalized[0].imageType, "modelled")
    assert.equal(normalized[1].imageType, "original")
    assert.equal(normalized[1].storagePath, "https://storage.googleapis.com/reloved/donations/originals/raw-camera-1.jpg")
  })

  it("toPublicItem permanently links originalImage, enhancedImage, and cutoutImage", () => {
    const doc: ItemDoc = {
      slug: "vintage-flannel-shirt-abc",
      title: "Vintage Flannel Shirt",
      category: "Clothing",
      description: "Preloved flannel shirt in excellent condition.",
      quantity: 1,
      brand: "Uniqlo",
      size: "M",
      condition: "Excellent",
      gender: "unisex",
      locality: "Bandra West",
      donorRecognition: "Priya",
      status: "approved",
      publicStatus: "available",
      publicVisibility: true,
      imageProcessingStatus: "ready",
      images: [
        {
          storagePath: "https://storage.googleapis.com/reloved/donations/enhanced/gemini-studio-1.jpg",
          imageType: "modelled",
          sortOrder: 0,
          bgRemoved: true,
        },
        {
          storagePath: "https://storage.googleapis.com/reloved/donations/cutouts/flat-cutout-1.png",
          imageType: "original",
          sortOrder: 1,
          bgRemoved: true,
        },
      ],
      donorOriginalPaths: [
        "https://storage.googleapis.com/reloved/donations/originals/raw-camera-1.jpg",
      ],
      originalImage: "https://storage.googleapis.com/reloved/donations/originals/raw-camera-1.jpg",
      enhancedImage: "https://storage.googleapis.com/reloved/donations/enhanced/gemini-studio-1.jpg",
      cutoutImage: "https://storage.googleapis.com/reloved/donations/cutouts/flat-cutout-1.png",
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const item = toPublicItem("test-item-123", doc)

    assert.equal(item.images[0].storagePath, "https://storage.googleapis.com/reloved/donations/enhanced/gemini-studio-1.jpg", "Image 1 is AI-enhanced")
    assert.equal(item.images[1].storagePath, "https://storage.googleapis.com/reloved/donations/cutouts/flat-cutout-1.png", "Image 2 is background-removed original")
    assert.equal(item.originalImage, "https://storage.googleapis.com/reloved/donations/originals/raw-camera-1.jpg", "Raw original preserved permanently")
    assert.equal(item.enhancedImage, "https://storage.googleapis.com/reloved/donations/enhanced/gemini-studio-1.jpg")
    assert.equal(item.cutoutImage, "https://storage.googleapis.com/reloved/donations/cutouts/flat-cutout-1.png")
  })

  it("Image 2 specifications strictly mandate background removal and complete person/body removal", () => {
    // Verify the prompt and pipeline rules
    const prompt = `Extract only the clothing/item from this photo for Reloved's Wall of Kindness.
NON-NEGOTIABLE REQUIREMENTS:
1. COMPLETE BACKGROUND REMOVAL
2. REMOVE PERSON AND BODY COMPLETELY
3. PRESERVE THE CLOTHING / ITEM EXACTLY
4. STUDIO FINISH`

    assert.ok(prompt.includes("COMPLETE BACKGROUND REMOVAL"), "Must require complete background removal")
    assert.ok(prompt.includes("REMOVE PERSON AND BODY COMPLETELY"), "Must require complete person/body removal")
    assert.ok(prompt.includes("PRESERVE THE CLOTHING / ITEM EXACTLY"), "Must keep original clothing without alteration")
  })
})
