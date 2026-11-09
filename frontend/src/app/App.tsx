import { useCategories } from '../api/queries/categories'

export function App() {
  const categories = useCategories()

  return (
    <>
      <h1>Critic</h1>
      {categories.isPending && <p>Loading categories…</p>}
      {categories.isError && <p role="alert">Couldn't load categories.</p>}
      {categories.data && (
        <ul>
          {categories.data.map((category) => (
            <li key={category.id}>{category.label}</li>
          ))}
        </ul>
      )}
    </>
  )
}
