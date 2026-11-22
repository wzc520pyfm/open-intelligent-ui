/**
 * IUI examples for UI SDK entry points whose documented example is JSX that
 * markup can't express as written: function children, imports, local helpers.
 * Every recipe here is rendered by the test suite.
 */
export const RECIPES: Record<string, string> = {
  button: `<row gap={2}>
  <Button variant="solid" on:click={saved = true}>Save</Button>
  <Button on:click={reset()}>Reset</Button>
  <Button variant="ghost" size="sm" aria-label="Copy link" on:click={copy(url)}><icon name="link" /></Button>
</row>`,

  calendar: `<state day="2026-10-16" />
<Calendar bind:value={day}>
  <CalendarPrevious />
  <CalendarHeading />
  <CalendarNext />
  <CalendarGrid>
    <CalendarWeekdays let:index><CalendarWeekday index={index} /></CalendarWeekdays>
    <CalendarWeeks let:cell><CalendarDay value={cell.date} /></CalendarWeeks>
  </CalendarGrid>
</Calendar>`,

  pagination: `<state page={1} />
<Pagination aria-label="Results" pageCount={10} bind:page={page}>
  <PaginationList let:pages>
    <PaginationItem><PaginationPrevious>Previous</PaginationPrevious></PaginationItem>
    {#each pages.items as item (item)}
      <PaginationItem>
        {#if typeof item == "number"}<PaginationLink page={item} />{:else}<PaginationEllipsis />{/if}
      </PaginationItem>
    {/each}
    <PaginationItem><PaginationNext>Next</PaginationNext></PaginationItem>
  </PaginationList>
</Pagination>`,

  rating: `<state stars={3} />
<Rating aria-label="Rating" bind:value={stars}>
  <RatingItem><icon name="star" /></RatingItem>
</Rating>`,

  toggle: `<state starred={false} />
<Toggle aria-label="Star" bind:pressed={starred}>
  <ToggleIcon><icon name="star" /></ToggleIcon>
</Toggle>`,

  textarea: `<state message="" />
<Textarea aria-label="Message" placeholder="Type your message here…" bind:value={message} />`,

  label: `<Label htmlFor="plan">Plan</Label>
<RadioGroup id="plan" defaultValue="pro">
  <label><Radio value="free"><RadioIndicator /></Radio> Free</label>
  <label><Radio value="pro"><RadioIndicator /></Radio> Pro</label>
</RadioGroup>`,

  "file-input": `<FileInput name="attachments" multiple>
  <FileInputDropzone>
    <p>Drag and drop files here</p>
    <FileInputTrigger>Browse files</FileInputTrigger>
  </FileInputDropzone>
  <FileInputList aria-label="Files">
    <FileInputItem let:item>
      <span>{item.file.name}</span>
      <FileInputItemRemove aria-label="Remove"><icon name="x" /></FileInputItemRemove>
    </FileInputItem>
  </FileInputList>
</FileInput>`,

  waterfall: `<state requests={[
  { value: "html", label: "index.html", start: 0, duration: 120 },
  { value: "css", label: "app.css", start: 90, duration: 60 }
]} />
<Waterfall aria-label="Network requests" items={requests}>
  {#each requests as request (request.value)}
    <WaterfallRow value={request.value}>
      <WaterfallRowHeader>{request.label}</WaterfallRowHeader>
      <WaterfallBar />
    </WaterfallRow>
  {/each}
</Waterfall>`,

  "token-input": `<state prompt={["Summarize the launch notes"]} />
<TokenInput bind:value={prompt}>
  <TokenInputEditor aria-label="Prompt" />
</TokenInput>`,

  "image-cropper": `<ImageCropper aria-label="Cover photo" src="https://picsum.photos/seed/iui/900/300" aspectRatio={3}>
  <ImageCropperViewport>
    <ImageCropperImage alt="Your cover photo" />
    <ImageCropperSelection />
    <ImageCropperHandle position="nw" />
    <ImageCropperHandle position="se" />
  </ImageCropperViewport>
</ImageCropper>`,
}

/** Entry points that can't be used from markup, and what to use instead. */
export const UNSUPPORTED: Record<string, string> = {
  toast: 'call the `toast("Saved", "success")` action from a handler',
  preferences: "needs a controller object created in JavaScript; keep preferences in `<state persist>`",
}

/**
 * Entry points listed in every prompt. The rest are named so a model knows
 * they exist, and described in full on request.
 */
export const CORE_COMPONENTS = [
  "button",
  "field",
  "input",
  "textarea",
  "number-input",
  "select",
  "combobox",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "segmented-control",
  "toggle",
  "tabs",
  "accordion",
  "collapsible",
  "dialog",
  "alert-dialog",
  "popover",
  "tooltip",
  "menu",
  "progress",
  "meter",
  "avatar",
  "calendar",
  "date-picker",
  "pagination",
  "rating",
]
