function gradients_per_octave = perlin_gradients(num_samples, num_dimensions, num_octaves)

if ( nargin < 3 )
  num_octaves = 1;
end

if ( nargin < 2 )
  num_dimensions = 1;
end

gradients_per_octave = cell( num_octaves, 1 );

for i = 1:num_octaves  
  gradients = randn(num_dimensions, num_samples);
  gradients = gradients ./ sqrt(sum(gradients .* gradients));
  
  gradients_per_octave{i} = gradients;
  
  num_samples = num_samples * 2;
end

end