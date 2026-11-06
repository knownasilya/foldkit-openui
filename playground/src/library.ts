import { createLibrary } from 'foldkit-openui'
import * as Content from './components/content.js'
import * as Data from './components/data.js'
import * as Forms from './components/forms.js'
import * as Layout from './components/layout.js'

// Components styled after Nuxt UI (https://ui.nuxt.com): same names and the
// same color/variant/size vocabulary, rendered as Foldkit views and styled
// in index.html. Stack, Row, and Grid are plain layout helpers.

const groups = {
  Layout: [Layout.Stack, Layout.Row, Layout.Grid, Layout.Card, Layout.Separator],
  Content: [
    Content.Heading,
    Content.Paragraph,
    Content.Text,
    Content.Badge,
    Content.Alert,
    Content.Avatar,
    Content.AvatarGroup,
    Content.User,
    Content.Kbd,
    Content.Link,
    Content.Progress,
    Content.Timeline,
    Content.Stepper,
    Content.Breadcrumb,
    Content.Accordion,
    Content.AccordionItem,
    Content.Empty,
  ],
  Forms: [
    Forms.Button,
    Forms.FormField,
    Forms.Input,
    Forms.Textarea,
    Forms.Select,
    Forms.SelectItem,
    Forms.RadioGroup,
    Forms.Checkbox,
    Forms.Switch,
    Forms.Slider,
  ],
  Data: [Data.Table, Data.Tabs, Data.TabItem, Data.ItemList],
}

export const playgroundLibrary = createLibrary({
  root: 'Stack',
  components: Object.values(groups).flat(),
  componentGroups: Object.entries(groups).map(([name, components]) => ({
    name,
    components: components.map((component) => component.name),
  })),
})
