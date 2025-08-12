# Some R code for reprex testing
library(ggplot2)
library(dplyr)

mtcars |>
  mutate(cyl = factor(cyl)) |>
  ggplot(aes(x = wt, y = mpg, fill = cyl, color = cyl)) +
  geom_point(shape = 21, size = 3, key_glyph = "rect") +
  theme_minimal(base_size = 14) +
  theme(legend.position = "bottom")
