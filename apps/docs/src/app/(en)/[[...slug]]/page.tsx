import { DocPage, metadataFor, paramsFor } from "@/components/page"

type Props = { params: Promise<{ slug?: string[] }> }

export const dynamicParams = false

export const generateStaticParams = () => paramsFor("en")

export async function generateMetadata(props: Props) {
  return metadataFor("en", (await props.params).slug)
}

export default async function Page(props: Props) {
  return <DocPage lang="en" slug={(await props.params).slug} />
}
