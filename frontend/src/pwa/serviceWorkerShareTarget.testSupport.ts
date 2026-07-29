import { Blob as NodeBlob, Buffer, File as NodeFile } from 'node:buffer'

export class ServiceWorkerTestRequest extends Request {
  override async formData(): Promise<FormData> {
    const contentType = this.headers.get('Content-Type')
    const boundaryMatch = contentType?.match(
      /^multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;]+))$/i,
    )
    const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2]

    if (!boundary) {
      return super.formData()
    }

    const body = Buffer.from(await this.arrayBuffer()).toString('latin1')
    const values = new Map<string, Array<File | string>>()

    for (const rawPart of body.split(`--${boundary}`).slice(1, -1)) {
      const part = rawPart.replace(/^\r\n/, '').replace(/\r\n$/, '')
      const headerEnd = part.indexOf('\r\n\r\n')

      if (headerEnd < 0) {
        continue
      }

      const rawHeaders = part.slice(0, headerEnd)
      const rawBody = part.slice(headerEnd + 4)
      const disposition = rawHeaders.match(
        /content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i,
      )

      if (!disposition) {
        continue
      }

      const [, fieldName, fileName] = disposition
      const currentValues = values.get(fieldName) ?? []

      if (fileName === undefined) {
        currentValues.push(Buffer.from(rawBody, 'latin1').toString('utf8'))
      } else {
        const type =
          rawHeaders.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() ?? ''

        currentValues.push(
          new NodeFile([Buffer.from(rawBody, 'latin1')], fileName, {
            type,
          }) as unknown as File,
        )
      }

      values.set(fieldName, currentValues)
    }

    return {
      getAll(name: string) {
        return values.get(name) ?? []
      },
    } as FormData
  }
}

export async function createShareTargetNavigationRequest({
  destination = 'document',
  formData,
  mode = 'navigate',
  url = 'https://lk.provgroup.ru/pwa/share-target',
}: {
  destination?: RequestDestination
  formData: FormData
  mode?: RequestMode
  url?: string
}): Promise<Request> {
  const boundary = '----portal-share-target-test-boundary'
  const bodyParts: Array<string | Uint8Array<ArrayBuffer>> = []

  for (const [fieldName, value] of formData.entries()) {
    const safeFieldName = fieldName.replaceAll('"', '%22')

    if (typeof value === 'string') {
      bodyParts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${safeFieldName}"\r\n\r\n${value}\r\n`,
      )
      continue
    }

    const safeFileName = value.name.replaceAll('"', '%22')
    const bytes = await readTestFileBytes(value)

    bodyParts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${safeFieldName}"; filename="${safeFileName}"\r\nContent-Type: ${value.type || 'application/octet-stream'}\r\n\r\n`,
      bytes,
      '\r\n',
    )
  }

  bodyParts.push(`--${boundary}--\r\n`)

  const request = new Request(url, {
    body: new NodeBlob(bodyParts) as unknown as Blob,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    method: 'POST',
  })

  return new Proxy(request, {
    get(target, property) {
      if (property === 'destination') {
        return destination
      }

      if (property === 'mode') {
        return mode
      }

      const value = Reflect.get(target, property, target)

      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

async function readTestFileBytes(
  file: File,
): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer())
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer))
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read test share file.'))
    }
    reader.readAsArrayBuffer(file)
  })
}
